import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { buildChecklist } from '../src/modules/bills/bills.core.js';
import { createVerifiedUser, paymentMethodIdOf, resetDatabase } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

// ---------- Núcleo (funções puras, sem banco) ----------

const entry = (id: number, type: string, amountCents: number, date: string, paid: boolean) => ({ id, type, amountCents, date, paid });

describe('checklist do período (RN-50, RN-50a, RN-50b) — unidade', () => {
  const entries = [
    entry(1, 'EXPENSE', 100, '2026-11-20', true),
    entry(2, 'EXPENSE', 200, '2026-11-25', false),
    entry(3, 'EXPENSE', 300, '2026-11-05', false),
    entry(4, 'EXPENSE', 400, '2026-11-02', true),
    entry(5, 'INCOME', 5000, '2026-11-05', true),
    entry(6, 'INCOME', 900, '2026-11-28', false),
  ];

  it('lista as despesas: pendentes por data e depois as pagas por data; receitas ficam fora', () => {
    expect(buildChecklist(entries, [], true).expenses.map((e) => e.id)).toEqual([3, 2, 4, 1]);
  });

  it('o progresso conta só as despesas', () => {
    expect(buildChecklist(entries, [], true).progress).toEqual({ paidCount: 2, totalCount: 4, paidCents: 500, pendingCents: 500 });
  });

  it('receitas pendentes vão para "A receber"', () => {
    expect(buildChecklist(entries, [], true).receivables).toEqual({ entries: [entries[5]], totalCents: 900 });
  });

  it('atrasadas de meses anteriores só aparecem, num aviso à parte, no período atual (RN-50c)', () => {
    const earlier = [entry(9, 'EXPENSE', 70, '2026-10-20', false), entry(8, 'INCOME', 30, '2026-09-01', false)];
    expect(buildChecklist(entries, earlier, true).previousOverdue).toEqual({
      entries: [earlier[1], earlier[0]],
      expenseCents: 70,
      incomeCents: 30,
    });
    expect(buildChecklist(entries, earlier, false).previousOverdue.entries).toEqual([]);
  });

  it('sem despesas, o progresso é zero de zero', () => {
    expect(buildChecklist([], [], true).progress).toEqual({ paidCount: 0, totalCount: 0, paidCents: 0, pendingCents: 0 });
  });
});

// ---------- API ----------

const app = createApp();
let cookie: string;
let food: number;
let salary: number;
let pix: number;

async function add(type: 'INCOME' | 'EXPENSE', amountCents: number, date: string, paid: boolean) {
  const body = { type, amountCents, date, paid, categoryId: type === 'INCOME' ? salary : food, paymentMethodId: type === 'EXPENSE' ? pix : null };
  return (await request(app).post('/api/entries').set('Cookie', cookie).send(body).expect(201)).body.entry;
}
const bills = (date?: string) => request(app).get(`/api/bills${date ? `?date=${date}` : ''}`).set('Cookie', cookie);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T15:00:00Z'));
  await resetDatabase();
  cookie = await createVerifiedUser(app);
  const categories = (await request(app).get('/api/categories').set('Cookie', cookie)).body.categories as { id: number; name: string }[];
  food = categories.find((c) => c.name === 'Alimentação')!.id;
  salary = categories.find((c) => c.name === 'Salário')!.id;
  pix = await paymentMethodIdOf(app, cookie);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Contas do mês pela API (RN-50 a RN-50c)', () => {
  it('mostra o período atual com progresso, lista, a receber e as atrasadas de antes', async () => {
    const octoberLate = await add('EXPENSE', 300, '2026-10-20', false);
    await add('EXPENSE', 999, '2026-10-21', true); // paga em outubro: não aparece
    const late = await add('EXPENSE', 100, '2026-11-10', false);
    const upcoming = await add('EXPENSE', 200, '2026-11-28', false);
    const paid = await add('EXPENSE', 400, '2026-11-05', true);
    const toReceive = await add('INCOME', 5000, '2026-11-30', false);

    const body = (await bills()).body;
    expect(body.period).toMatchObject({ start: '2026-11-01', end: '2026-11-30', isCurrent: true });
    expect(body.progress).toEqual({ paidCount: 1, totalCount: 3, paidCents: 400, pendingCents: 300 });
    expect(body.expenses.map((e: { id: number }) => e.id)).toEqual([late.id, upcoming.id, paid.id]);
    expect(body.expenses[0]).toMatchObject({ overdue: true, paymentMethodId: pix });
    expect(body.receivables).toMatchObject({ totalCents: 5000, entries: [expect.objectContaining({ id: toReceive.id })] });
    expect(body.previousOverdue).toMatchObject({ expenseCents: 300, entries: [expect.objectContaining({ id: octoberLate.id, overdue: true })] });
  });

  it('num período passado, mostra só as contas dele, com as pendentes como atrasadas', async () => {
    await add('EXPENSE', 300, '2026-09-20', false);
    const late = await add('EXPENSE', 100, '2026-10-20', false);
    const body = (await bills('2026-10-15')).body;
    expect(body.period.isCurrent).toBe(false);
    expect(body.expenses).toEqual([expect.objectContaining({ id: late.id, overdue: true })]);
    expect(body.previousOverdue.entries).toEqual([]);
  });

  it('marcar uma conta atualiza o progresso e tira a atrasada do aviso', async () => {
    const octoberLate = await add('EXPENSE', 300, '2026-10-20', false);
    const bill = await add('EXPENSE', 100, '2026-11-10', false);
    for (const id of [octoberLate.id, bill.id]) {
      await request(app).patch(`/api/entries/${id}/paid`).set('Cookie', cookie).send({ paid: true }).expect(200);
    }
    const body = (await bills()).body;
    expect(body.progress).toMatchObject({ paidCount: 1, totalCount: 1, pendingCents: 0 });
    expect(body.previousOverdue.entries).toEqual([]);
  });

  it('o painel mostra o mesmo progresso (RN-48, RN-50a)', async () => {
    await add('EXPENSE', 100, '2026-11-10', true);
    await add('EXPENSE', 200, '2026-11-28', false);
    expect((await request(app).get('/api/dashboard').set('Cookie', cookie)).body.billsProgress).toEqual({
      paidCount: 1,
      totalCount: 2,
      paidCents: 100,
      pendingCents: 200,
    });
  });

  it('mostra só as contas do próprio usuário (RN-04) e exige login', async () => {
    await add('EXPENSE', 100, '2026-11-10', false);
    const other = await createVerifiedUser(app, 'outro@example.com');
    const body = (await request(app).get('/api/bills').set('Cookie', other)).body;
    expect(body.expenses).toEqual([]);
    expect((await request(app).get('/api/bills')).status).toBe(401);
  });
});
