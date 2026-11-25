import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { applyNoticeStates, buildNotifications, type Notification, type NotificationInput } from '../src/modules/notifications/notifications.core.js';
import { createVerifiedUser, paymentMethodIdOf, resetDatabase, sessionCookieOf } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

// ---------- Núcleo (funções puras, sem banco) ----------

const empty: NotificationInput = {
  today: '2026-11-10',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-30',
  overdue: { count: 0, expenseCents: 0, incomeCents: 0 },
  upcoming: [],
  budget: { classes: [], categories: [] },
  cards: [],
  goals: { savings: null, investment: null },
};

describe('central de avisos (RN-72) — unidade', () => {
  it('sem nada pendente, não há avisos', () => {
    expect(buildNotifications(empty)).toEqual([]);
  });

  it('atrasadas viram um único aviso, com a quantidade como nível e o destaque nas Contas', () => {
    const [notice] = buildNotifications({ ...empty, overdue: { count: 3, expenseCents: 31790, incomeCents: 0 } });
    expect(notice).toMatchObject({ key: 'overdue', level: 3, kind: 'OVERDUE', severity: 'danger', href: '/contas?destaque=atrasadas', expenseCents: 31790 });
  });

  it('a vencer: só de hoje até 3 dias à frente, num único aviso', () => {
    const upcoming = [
      { payDate: '2026-11-10', amountCents: 100, type: 'EXPENSE' },
      { payDate: '2026-11-13', amountCents: 200, type: 'EXPENSE' },
      { payDate: '2026-11-14', amountCents: 999, type: 'EXPENSE' }, // 4 dias: fora
    ];
    expect(buildNotifications({ ...empty, upcoming })).toEqual([
      { key: 'due-soon', level: 2, kind: 'DUE_SOON', severity: 'warning', href: '/contas?destaque=a-vencer', count: 2, amountCents: 300, untilDate: '2026-11-13' },
    ]);
  });

  it('orçamento e cartões em atenção (nível 1) ou estourados (nível 2); os estourados vêm primeiro', () => {
    const notices = buildNotifications({
      ...empty,
      budget: {
        classes: [{ expenseClass: 'FIXED', usedPercent: 90, status: 'WARNING' }],
        categories: [
          { categoryId: 1, name: 'Lazer', usedPercent: 147, status: 'EXCEEDED' },
          { categoryId: 2, name: 'Transporte', usedPercent: 50, status: 'OK' },
        ],
      },
      cards: [
        { id: 7, name: 'Cartão principal', usedCents: 85000, limitCents: 100000, usageStatus: 'WARNING', archived: false },
        { id: 8, name: 'Arquivado', usedCents: 200000, limitCents: 100000, usageStatus: 'EXCEEDED', archived: true },
      ],
    });
    expect(notices.map((n) => [n.key, n.level, n.href])).toEqual([
      ['budget-category-1:2026-11-01', 2, '/?destaque=orcamento-categoria-1'],
      ['budget-class-FIXED:2026-11-01', 1, '/?destaque=orcamento-classe-FIXED'],
      ['card-7', 1, '/configuracoes/pagamentos?destaque=cartao-7'],
    ]);
  });

  it('metas não atingidas só nos últimos 7 dias do período', () => {
    const goals = { savings: { achieved: false, remainingCents: 5000 }, investment: { achieved: true, remainingCents: 0 } };
    expect(buildNotifications({ ...empty, goals, today: '2026-11-23' })).toEqual([]); // faltam 7 dias
    expect(buildNotifications({ ...empty, goals, today: '2026-11-24' })).toMatchObject([
      { key: 'goal-SAVINGS:2026-11-01', kind: 'GOAL', goal: 'SAVINGS', remainingCents: 5000, daysLeft: 6, href: '/?destaque=meta-SAVINGS' },
    ]);
  });
});

describe('lido e dispensado (RN-72a, RN-72b) — unidade', () => {
  const overdue = (count: number) => buildNotifications({ ...empty, overdue: { count, expenseCents: 100, incomeCents: 0 } }) as Notification[];
  const state = (s: Partial<{ readLevel: number; dismissedUntil: string; dismissedLevel: number }>) => [
    { key: 'overdue', readLevel: null, dismissedUntil: null, dismissedLevel: null, ...s },
  ];

  it('sem ação do usuário, o aviso é não lido', () => {
    expect(applyNoticeStates(overdue(2), [], '2026-11-10')).toMatchObject({ unread: 1, visible: [{ read: false }], dismissed: [] });
  });

  it('lido continua na lista, mas não conta; se piorar, volta a não lido', () => {
    expect(applyNoticeStates(overdue(2), state({ readLevel: 2 }), '2026-11-10')).toMatchObject({ unread: 0, visible: [{ read: true }] });
    expect(applyNoticeStates(overdue(1), state({ readLevel: 2 }), '2026-11-10').unread).toBe(0); // melhorou
    expect(applyNoticeStates(overdue(3), state({ readLevel: 2 }), '2026-11-10').unread).toBe(1); // piorou
  });

  it('dispensado sai do sino até a data; volta depois dela ou se piorar antes', () => {
    const dismissed = state({ dismissedUntil: '2026-11-13', dismissedLevel: 2 });
    expect(applyNoticeStates(overdue(2), dismissed, '2026-11-12')).toMatchObject({ visible: [], unread: 0, dismissed: [{ dismissedUntil: '2026-11-13' }] });
    expect(applyNoticeStates(overdue(2), dismissed, '2026-11-13')).toMatchObject({ unread: 1, dismissed: [] });
    expect(applyNoticeStates(overdue(3), dismissed, '2026-11-12')).toMatchObject({ unread: 1, dismissed: [] });
  });
});

// ---------- API ----------

const app = createApp();
let cookie: string;
let food: number;
let pix: number;

const notices = async () => (await request(app).get('/api/notifications').set('Cookie', cookie).expect(200)).body;
const add = (amountCents: number, date: string, paid: boolean) =>
  request(app).post('/api/entries').set('Cookie', cookie).send({ type: 'EXPENSE', amountCents, date, categoryId: food, paymentMethodId: pix, paid }).expect(201);
const action = (key: string, what: 'read' | 'dismiss' | 'restore') =>
  request(app).post(`/api/notifications/${encodeURIComponent(key)}/${what}`).set('Cookie', cookie);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
  await resetDatabase();
  cookie = await createVerifiedUser(app);
  const categories = (await request(app).get('/api/categories').set('Cookie', cookie)).body.categories as { id: number; name: string }[];
  food = categories.find((c) => c.name === 'Alimentação')!.id;
  pix = await paymentMethodIdOf(app, cookie);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('central de avisos pela API (RN-72 a RN-72b)', () => {
  it('reúne atrasadas, a vencer, orçamento e metas do usuário', async () => {
    await add(5000, '2026-11-20', false); // atrasada
    await add(3000, '2026-11-27', false); // vence em 2 dias
    await add(9000, '2026-11-05', true);
    await request(app).put('/api/budgets').set('Cookie', cookie).send({ kind: 'CATEGORY_LIMIT', categoryId: food, amountCents: 10000 }).expect(200);
    await request(app).put('/api/budgets').set('Cookie', cookie).send({ kind: 'SAVINGS_GOAL', amountCents: 100000 }).expect(200);

    const body = await notices();
    expect(body.notifications.map((n: { kind: string }) => n.kind)).toEqual(['OVERDUE', 'BUDGET', 'DUE_SOON', 'GOAL']);
    expect(body.unread).toBe(4);
    expect(body.notifications[1]).toMatchObject({ name: 'Alimentação', status: 'EXCEEDED', usedPercent: 170, read: false });
  });

  it('clicar marca como lido; mais uma conta atrasada faz voltar a não lido', async () => {
    await add(5000, '2026-11-20', false);
    await action('overdue', 'read').expect(204);
    expect(await notices()).toMatchObject({ unread: 0, notifications: [{ key: 'overdue', read: true }] });

    await add(2000, '2026-11-21', false);
    expect(await notices()).toMatchObject({ unread: 1, notifications: [{ key: 'overdue', read: false, count: 2 }] });
  });

  it('quando a situação se resolve e depois volta, o aviso é novo de novo', async () => {
    const late = (await add(5000, '2026-11-20', false)).body.entry;
    await add(2000, '2026-11-21', false);
    await action('overdue', 'read').expect(204); // lido com 2 contas atrasadas
    await action('overdue', 'dismiss').expect(200);

    // Paga as duas: o aviso some.
    for (const entry of (await request(app).get('/api/entries?start=2026-11-01&end=2026-11-30').set('Cookie', cookie)).body.entries) {
      await request(app).patch(`/api/entries/${entry.id}/paid`).set('Cookie', cookie).send({ paid: true }).expect(200);
    }
    expect(await notices()).toMatchObject({ notifications: [], dismissed: [] });

    // Uma conta volta a atrasar: é uma situação nova, não lida e não dispensada.
    await request(app).patch(`/api/entries/${late.id}/paid`).set('Cookie', cookie).send({ paid: false }).expect(200);
    expect(await notices()).toMatchObject({ unread: 1, notifications: [{ key: 'overdue', read: false, count: 1 }] });
  });

  it('dispensar usa os dias das configurações; o aviso volta depois deles', async () => {
    await request(app).patch('/api/settings/preferences').set('Cookie', cookie).send({ noticeSnoozeDays: 7 }).expect(200);
    await add(5000, '2026-11-20', false);
    expect((await action('overdue', 'dismiss').expect(200)).body).toEqual({ dismissedUntil: '2026-12-02' });
    expect(await notices()).toMatchObject({ notifications: [], unread: 0, dismissed: [{ key: 'overdue', dismissedUntil: '2026-12-02' }] });

    vi.setSystemTime(new Date('2026-12-02T15:00:00Z'));
    const login = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'senha1234' }).expect(200);
    cookie = sessionCookieOf(login);
    expect((await notices()).notifications.map((n: { key: string }) => n.key)).toContain('overdue');
  });

  it('mostrar de novo traz o aviso dispensado de volta ao sino', async () => {
    await add(5000, '2026-11-20', false);
    await action('overdue', 'dismiss').expect(200);
    await action('overdue', 'restore').expect(204);
    expect(await notices()).toMatchObject({ unread: 1, dismissed: [] });
  });

  it('aviso de situação já resolvida não pode ser lido nem dispensado', async () => {
    expect((await action('overdue', 'read')).body.error.code).toBe('NOTICE_NOT_FOUND');
  });

  it('o tempo de dispensa só aceita 1, 3, 7, 15 ou 30 dias', async () => {
    const patch = (noticeSnoozeDays: unknown) => request(app).patch('/api/settings/preferences').set('Cookie', cookie).send({ noticeSnoozeDays });
    expect((await patch(2)).status).toBe(400);
    expect((await patch(15)).body.user.noticeSnoozeDays).toBe(15);
  });

  it('cada usuário vê só os próprios avisos (RN-04) e exige login', async () => {
    await add(5000, '2026-11-20', false);
    const other = await createVerifiedUser(app, 'outro@example.com');
    expect((await request(app).get('/api/notifications').set('Cookie', other)).body.notifications).toEqual([]);
    expect((await request(app).post('/api/notifications/overdue/read').set('Cookie', other)).status).toBe(404);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });
});
