import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, addMonths, maxEntryDate, today } from '../../shared/period.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createVerifiedUser, resetDatabase } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const app = createApp();
let cookie: string;
let food: number; // despesa
let leisure: number; // despesa
let salary: number; // receita

type Entry = { id: number; type: string; amountCents: number; date: string; categoryId: number; description: string | null; paid: boolean; overdue: boolean };

const create = (body: object, sessionCookie = cookie) => request(app).post('/api/entries').set('Cookie', sessionCookie).send(body);
const update = (id: number, body: object, sessionCookie = cookie) =>
  request(app).put(`/api/entries/${id}`).set('Cookie', sessionCookie).send(body);
const list = (query: string, sessionCookie = cookie) => request(app).get(`/api/entries?${query}`).set('Cookie', sessionCookie);
const repeat = (id: number, times: number) => request(app).post(`/api/entries/${id}/repeat`).set('Cookie', cookie).send({ times });

function expense(overrides: object = {}) {
  return { type: 'EXPENSE', amountCents: 5000, date: '2026-11-10', categoryId: food, description: 'Mercado', ...overrides };
}

async function categoryId(name: string, sessionCookie = cookie): Promise<number> {
  const response = await request(app).get('/api/categories').set('Cookie', sessionCookie);
  return (response.body.categories as { id: number; name: string }[]).find((c) => c.name === name)!.id;
}

beforeEach(async () => {
  await resetDatabase();
  cookie = await createVerifiedUser(app);
  food = await categoryId('Alimentação');
  leisure = await categoryId('Lazer');
  salary = await categoryId('Salário');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('criação (RN-19 a RN-21, RN-23)', () => {
  it('cria um lançamento com todos os campos', async () => {
    const response = await create(expense());
    expect(response.status).toBe(201);
    expect(response.body.entry).toMatchObject({ type: 'EXPENSE', amountCents: 5000, date: '2026-11-10', categoryId: food, description: 'Mercado' });
  });

  it('a descrição é opcional, e vazia vira nula (RN-19)', async () => {
    expect((await create(expense({ description: '   ' }))).body.entry.description).toBeNull();
    expect((await create(expense({ description: undefined }))).status).toBe(201);
    expect((await create(expense({ description: 'x'.repeat(121) }))).status).toBe(400);
  });

  it('valor maior que zero e até R$ 10.000.000,00, em centavos (RN-01, RN-20)', async () => {
    expect((await create(expense({ amountCents: 0 }))).status).toBe(400);
    expect((await create(expense({ amountCents: -100 }))).status).toBe(400);
    expect((await create(expense({ amountCents: 10.5 }))).status).toBe(400);
    expect((await create(expense({ amountCents: 1_000_000_001 }))).status).toBe(400);
    expect((await create(expense({ amountCents: 1_000_000_000 }))).status).toBe(201);
    expect((await create(expense({ amountCents: 1 }))).status).toBe(201);
  });

  it('a categoria deve ser do usuário e do mesmo tipo (RN-21)', async () => {
    const mismatch = await create(expense({ categoryId: salary }));
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('CATEGORY_TYPE_MISMATCH');
    expect(mismatch.body.error.fields[0].path).toBe('categoryId');

    const other = await createVerifiedUser(app, 'outro@example.com');
    const otherFood = await categoryId('Alimentação', other);
    expect((await create(expense({ categoryId: otherFood }))).status).toBe(400);
    expect((await create(expense({ categoryId: undefined }))).status).toBe(400);
  });

  it('datas de 01/01/2000 até 12 meses à frente (RN-23)', async () => {
    expect((await create(expense({ date: '1999-12-31' }))).status).toBe(400);
    expect((await create(expense({ date: '2000-01-01' }))).status).toBe(201);
    expect((await create(expense({ date: maxEntryDate() }))).status).toBe(201);
    expect((await create(expense({ date: addMonths(maxEntryDate(), 1) }))).status).toBe(400);
    expect((await create(expense({ date: '2026-02-30' }))).status).toBe(400);
    expect((await create(expense({ date: '10/11/2026' }))).status).toBe(400);
  });
});

describe('situação: pendente ou pago (RN-22)', () => {
  const setPaid = (id: number, paid: unknown, sessionCookie = cookie) =>
    request(app).patch(`/api/entries/${id}/paid`).set('Cookie', sessionCookie).send({ paid });

  it('sem informar, sugere pela data: até hoje pago, futuro pendente', async () => {
    const past = (await create(expense({ date: '2020-05-01' }))).body.entry;
    const now = (await create(expense({ date: today() }))).body.entry;
    const future = (await create(expense({ date: addMonths(today(), 1) }))).body.entry;

    expect(past.paid).toBe(true);
    expect(now.paid).toBe(true);
    expect(future.paid).toBe(false);
  });

  it('o usuário pode informar a situação ao criar', async () => {
    const unpaidPast = (await create(expense({ date: '2026-01-10', paid: false }))).body.entry;
    const paidFuture = (await create(expense({ date: addMonths(today(), 1), paid: true }))).body.entry;

    expect(unpaidPast.paid).toBe(false);
    expect(paidFuture.paid).toBe(true);
    expect((await create(expense({ paid: 'sim' }))).status).toBe(400);
  });

  it('a situação não muda sozinha quando a data chega', async () => {
    // Amanhã: avançar mais que 7 dias faria a sessão de teste expirar (RN-08).
    const date = addDays(today(), 1);
    await create(expense({ date }));

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${date}T15:00:00Z`));
    const after = (await list(`start=${date}&end=${date}`)).body.entries[0];
    expect(after.paid).toBe(false);
  });

  it('pendente com data passada fica atrasado (RN-22a)', async () => {
    const yesterday = addDays(today(), -1);
    await create(expense({ date: yesterday, paid: false }));
    await create(expense({ date: today(), paid: false }));
    await create(expense({ date: yesterday, paid: true }));

    const { entries, totals } = (await list(`start=${yesterday}&end=${today()}`)).body;
    expect(entries.map((e: Entry) => [e.date, e.paid, e.overdue])).toEqual([
      [today(), false, false],
      [yesterday, true, false],
      [yesterday, false, true],
    ]);
    expect(totals.overdueCount).toBe(1);
  });

  it('marca e desmarca pela lista (RN-22b)', async () => {
    const entry = (await create(expense({ date: addMonths(today(), 1) }))).body.entry;

    const marked = await setPaid(entry.id, true);
    expect(marked.status).toBe(200);
    expect(marked.body.entry.paid).toBe(true);
    expect((await setPaid(entry.id, false)).body.entry.paid).toBe(false);
    expect((await setPaid(entry.id, 'sim')).status).toBe(400);
  });

  it('não marca lançamentos de outro usuário (RN-04)', async () => {
    const entry = (await create(expense())).body.entry;
    const other = await createVerifiedUser(app, 'outro@example.com');
    expect((await setPaid(entry.id, false, other)).status).toBe(404);
  });
});

describe('listagem e totais (RN-26, RN-27)', () => {
  beforeEach(async () => {
    await create(expense({ amountCents: 10000, date: '2026-11-01' }));
    await create(expense({ amountCents: 2500, date: '2026-11-15', categoryId: leisure }));
    await create({ type: 'INCOME', amountCents: 500000, date: '2026-11-05', categoryId: salary });
    await create(expense({ amountCents: 99999, date: '2026-12-01' })); // fora do período
  });

  it('traz só o intervalo pedido, do mais recente para o mais antigo', async () => {
    const response = await list('start=2026-11-01&end=2026-11-30');
    expect(response.body.entries.map((e: Entry) => e.date)).toEqual(['2026-11-15', '2026-11-05', '2026-11-01']);
  });

  it('calcula receitas, despesas e resultado', async () => {
    const { totals } = (await list('start=2026-11-01&end=2026-11-30')).body;
    expect(totals).toMatchObject({ incomePaid: 500000, expensePaid: 12500, result: 487500 });
  });

  it('separa pendente de pago no resultado projetado', async () => {
    await create({ type: 'INCOME', amountCents: 1000, date: '2026-11-20', categoryId: salary, paid: false });
    await create(expense({ amountCents: 300, date: '2026-11-20', paid: false }));

    const { totals } = (await list('start=2026-11-01&end=2026-11-30')).body;
    expect(totals).toMatchObject({ result: 487500, incomePending: 1000, expensePending: 300, projected: 488200 });
  });

  it('filtra por tipo e por categoria', async () => {
    const byType = await list('start=2026-11-01&end=2026-11-30&type=INCOME');
    expect(byType.body.entries).toHaveLength(1);

    const byCategory = await list(`start=2026-11-01&end=2026-11-30&categoryId=${leisure}`);
    expect(byCategory.body.entries.map((e: Entry) => e.amountCents)).toEqual([2500]);
    expect(byCategory.body.totals.expensePaid).toBe(2500);
  });

  it('exige um intervalo válido', async () => {
    expect((await list('start=2026-11-30&end=2026-11-01')).status).toBe(400);
    expect((await list('')).status).toBe(400);
  });

  it('cada usuário vê só os próprios lançamentos (RN-04)', async () => {
    const other = await createVerifiedUser(app, 'outro@example.com');
    expect((await list('start=2026-11-01&end=2026-11-30', other)).body.entries).toHaveLength(0);
  });
});

describe('edição e exclusão (RN-24, RN-25)', () => {
  it('edita todos os campos; mudar a data não muda a situação', async () => {
    const entry = (await create(expense({ date: '2026-11-10' }))).body.entry;
    const future = addMonths(today(), 2);

    const response = await update(entry.id, { type: 'INCOME', amountCents: 1234, date: future, categoryId: salary, description: 'Bônus' });
    expect(response.status).toBe(200);
    expect(response.body.entry).toMatchObject({ type: 'INCOME', amountCents: 1234, categoryId: salary, description: 'Bônus', paid: true });

    const unpaid = await update(entry.id, { ...expense(), paid: false });
    expect(unpaid.body.entry.paid).toBe(false);
  });

  it('a edição tem as mesmas validações da criação', async () => {
    const entry = (await create(expense())).body.entry;
    expect((await update(entry.id, expense({ categoryId: salary }))).status).toBe(400);
    expect((await update(entry.id, expense({ amountCents: 0 }))).status).toBe(400);
  });

  it('exclui definitivamente', async () => {
    const entry = (await create(expense())).body.entry;
    await request(app).delete(`/api/entries/${entry.id}`).set('Cookie', cookie).expect(204);
    expect(await prisma.entry.count()).toBe(0);
  });

  it('não edita nem exclui lançamentos de outro usuário (RN-04)', async () => {
    const entry = (await create(expense())).body.entry;
    const other = await createVerifiedUser(app, 'outro@example.com');
    const otherFood = await categoryId('Alimentação', other);

    expect((await update(entry.id, expense({ categoryId: otherFood }), other)).status).toBe(404);
    expect((await request(app).delete(`/api/entries/${entry.id}`).set('Cookie', other)).status).toBe(404);
    expect(await prisma.entry.count()).toBe(1);
  });
});

describe('repetir mensalmente (RN-25b a RN-25d)', () => {
  it('cria cópias nos meses seguintes, no mesmo dia', async () => {
    const entry = (await create(expense({ date: '2026-11-10' }))).body.entry;
    const response = await repeat(entry.id, 3);

    expect(response.status).toBe(201);
    expect(response.body.entries.map((e: Entry) => e.date)).toEqual(['2026-12-10', '2027-01-10', '2027-02-10']);
    expect(response.body.entries.every((e: Entry) => e.amountCents === 5000 && e.categoryId === food && e.description === 'Mercado')).toBe(true);
  });

  it('cada cópia recebe a situação sugerida pela própria data (RN-22)', async () => {
    const entry = (await create(expense({ date: addMonths(today(), -2), paid: false }))).body.entry;
    const copies = (await repeat(entry.id, 3)).body.entries;
    expect(copies.map((e: Entry) => e.paid)).toEqual([true, true, false]);
  });

  it('usa o último dia do mês quando o dia não existe', async () => {
    const entry = (await create(expense({ date: '2026-01-31' }))).body.entry;
    const dates = (await repeat(entry.id, 3)).body.entries.map((e: Entry) => e.date);
    expect(dates).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('as cópias são independentes do original (RN-25c)', async () => {
    const entry = (await create(expense({ date: '2026-11-10' }))).body.entry;
    const [copy] = (await repeat(entry.id, 1)).body.entries;

    await update(entry.id, expense({ date: '2026-11-10', amountCents: 1 }));
    await request(app).delete(`/api/entries/${entry.id}`).set('Cookie', cookie).expect(204);

    const stored = await prisma.entry.findUniqueOrThrow({ where: { id: copy.id } });
    expect(stored.amountCents).toBe(5000);
  });

  it('é tudo ou nada, e informa quantas repetições cabem (RN-25d)', async () => {
    const date = addMonths(today(), 10);
    const entry = (await create(expense({ date }))).body.entry;

    const response = await repeat(entry.id, 5);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('REPEAT_LIMIT');
    expect(response.body.error.message).toContain('Só é possível repetir 2 vezes');
    expect(await prisma.entry.count()).toBe(1);

    expect((await repeat(entry.id, 2)).status).toBe(201);
  });

  it('aceita de 1 a 12 repetições', async () => {
    const entry = (await create(expense({ date: '2026-01-10' }))).body.entry;
    expect((await repeat(entry.id, 0)).status).toBe(400);
    expect((await repeat(entry.id, 13)).status).toBe(400);
  });
});

describe('exclusão de categoria com lançamentos (RN-18)', () => {
  it('pede o destino e move os lançamentos junto com a exclusão', async () => {
    await create(expense({ categoryId: leisure }));
    await create(expense({ categoryId: leisure }));

    const blocked = await request(app).delete(`/api/categories/${leisure}`).set('Cookie', cookie);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CATEGORY_HAS_ENTRIES');
    expect(blocked.body.error.message).toContain('2 lançamento');

    await request(app).delete(`/api/categories/${leisure}?moveTo=${food}`).set('Cookie', cookie).expect(204);
    expect(await prisma.entry.count({ where: { categoryId: food } })).toBe(2);
    expect(await prisma.category.count({ where: { id: leisure } })).toBe(0);
  });

  it('excluir a conta apaga também os lançamentos (RN-47)', async () => {
    await create(expense());
    await request(app).post('/api/settings/delete-account').set('Cookie', cookie).send({ password: 'senha1234' }).expect(204);
    expect(await prisma.entry.count()).toBe(0);
  });
});
