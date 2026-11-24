import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createVerifiedUser, paymentMethodIdOf, resetDatabase, sessionCookieOf } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const app = createApp();
let cookie: string;
let pix: number;
let food: number;
let leisure: number;
let housing: number;
let reserve: number;
let salary: number;

const setToday = (date: string) => vi.setSystemTime(new Date(`${date}T15:00:00Z`));

/** Avança o relógio e entra de novo: a sessão de 7 dias expira quando o tempo pula meses. */
async function jumpTo(date: string) {
  setToday(date);
  const login = await request(app).post('/api/auth/login').send({ email: 'ana@example.com', password: 'senha1234' }).expect(200);
  cookie = sessionCookieOf(login);
}

const put = (body: object, sessionCookie = cookie) => request(app).put('/api/budgets').set('Cookie', sessionCookie).send(body);
const get = (date?: string) => request(app).get(`/api/budgets${date ? `?date=${date}` : ''}`).set('Cookie', cookie);
const dashboard = (date?: string) => request(app).get(`/api/dashboard${date ? `?date=${date}` : ''}`).set('Cookie', cookie);

async function add(amountCents: number, date: string, paid: boolean, categoryId: number, type: 'INCOME' | 'EXPENSE' = 'EXPENSE') {
  await request(app).post('/api/entries').set('Cookie', cookie).send({ type, amountCents, date, categoryId, paid, paymentMethodId: type === 'EXPENSE' ? pix : null }).expect(201);
}

async function categoryId(name: string): Promise<number> {
  const response = await request(app).get('/api/categories').set('Cookie', cookie);
  return (response.body.categories as { id: number; name: string }[]).find((c) => c.name === name)!.id;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setToday('2026-11-10');
  await resetDatabase();
  cookie = await createVerifiedUser(app);
  pix = await paymentMethodIdOf(app, cookie);
  food = await categoryId('Alimentação');
  leisure = await categoryId('Lazer');
  housing = await categoryId('Moradia');
  reserve = await categoryId('Reserva de emergência');
  salary = await categoryId('Salário');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('definir limites e metas (RN-29, RN-29a, RN-29b, RN-33)', () => {
  it('define limite de categoria, de classe e as duas metas', async () => {
    await put({ kind: 'CATEGORY_LIMIT', categoryId: food, amountCents: 80000 }).expect(200);
    await put({ kind: 'CLASS_LIMIT', expenseClass: 'VARIABLE', amountCents: 150000 }).expect(200);
    await put({ kind: 'INVESTMENT_GOAL', amountCents: 50000 }).expect(200);
    const response = await put({ kind: 'SAVINGS_GOAL', amountCents: 100000 }).expect(200);

    expect(response.body).toMatchObject({
      categoryLimits: [{ categoryId: food, amountCents: 80000 }],
      classLimits: { FIXED: null, VARIABLE: 150000 },
      investmentGoalCents: 50000,
      savingsGoalCents: 100000,
    });
  });

  it('valida o valor e o alvo de cada tipo', async () => {
    expect((await put({ kind: 'CATEGORY_LIMIT', categoryId: food, amountCents: 0 })).status).toBe(400);
    expect((await put({ kind: 'CATEGORY_LIMIT', amountCents: 100 })).status).toBe(400);
    expect((await put({ kind: 'CLASS_LIMIT', expenseClass: 'INVESTMENT', amountCents: 100 })).status).toBe(400);
    expect((await put({ kind: 'SAVINGS_GOAL', categoryId: food, amountCents: 100 })).status).toBe(400);
    expect((await put({ kind: 'OUTRO', amountCents: 100 })).status).toBe(400);
  });

  it('categorias de investimento e de receita não têm limite (RN-29, RN-29b)', async () => {
    const investment = await put({ kind: 'CATEGORY_LIMIT', categoryId: reserve, amountCents: 100 });
    expect(investment.status).toBe(400);
    expect(investment.body.error.code).toBe('CATEGORY_WITHOUT_LIMIT');
    expect((await put({ kind: 'CATEGORY_LIMIT', categoryId: salary, amountCents: 100 })).status).toBe(400);
  });

  it('só altera as próprias categorias (RN-04)', async () => {
    const other = await createVerifiedUser(app, 'outro@example.com');
    expect((await put({ kind: 'CATEGORY_LIMIT', categoryId: food, amountCents: 100 }, other)).status).toBe(404);
  });

  it('avisa, mas permite, quando a soma das categorias passa do limite da classe (RN-29a)', async () => {
    await put({ kind: 'CLASS_LIMIT', expenseClass: 'VARIABLE', amountCents: 100000 }).expect(200);
    await put({ kind: 'CATEGORY_LIMIT', categoryId: food, amountCents: 70000 }).expect(200);
    const response = await put({ kind: 'CATEGORY_LIMIT', categoryId: leisure, amountCents: 40000 }).expect(200);
    expect(response.body.classWarnings).toEqual({ FIXED: false, VARIABLE: true });
  });
});

describe('limite salvo junto com a categoria (RN-29)', () => {
  const createCategory = (body: object) => request(app).post('/api/categories').set('Cookie', cookie).send(body);
  const patchCategory = (id: number, body: object) => request(app).patch(`/api/categories/${id}`).set('Cookie', cookie).send(body);
  const limits = async () => (await get()).body.categoryLimits as { categoryId: number; amountCents: number }[];

  it('cria a categoria já com o limite', async () => {
    const created = await createCategory({ type: 'EXPENSE', name: 'Pets', color: 'lime', expenseClass: 'VARIABLE', limitCents: 20000 }).expect(201);
    expect(await limits()).toEqual([{ categoryId: created.body.category.id, amountCents: 20000 }]);
  });

  it('se a categoria não pode ser salva, o limite também não é: ou os dois, ou nenhum', async () => {
    const duplicate = await createCategory({ type: 'EXPENSE', name: 'Lazer', color: 'lime', expenseClass: 'VARIABLE', limitCents: 20000 });
    expect(duplicate.status).toBe(409);
    expect(await limits()).toEqual([]);

    const renamed = await patchCategory(food, { name: 'Lazer', limitCents: 30000 });
    expect(renamed.status).toBe(409);
    expect(await limits()).toEqual([]);
  });

  it('altera e remove o limite pela edição da categoria', async () => {
    await patchCategory(food, { limitCents: 50000 }).expect(200);
    expect(await limits()).toEqual([{ categoryId: food, amountCents: 50000 }]);
    await patchCategory(food, { limitCents: null }).expect(200);
    expect(await limits()).toEqual([]);
  });

  it('recusa limite em receita e em investimento, sem criar a categoria', async () => {
    const income = await createCategory({ type: 'INCOME', name: 'Bolsa', color: 'lime', limitCents: 100 });
    expect(income.status).toBe(400);
    expect(income.body.error.fields[0].path).toBe('limitCents');
    expect((await createCategory({ type: 'EXPENSE', name: 'Cripto', color: 'lime', expenseClass: 'INVESTMENT', limitCents: 100 })).status).toBe(400);
    expect((await patchCategory(reserve, { limitCents: 100 })).status).toBe(400);

    const names = (await request(app).get('/api/categories').set('Cookie', cookie)).body.categories.map((c: { name: string }) => c.name);
    expect(names).not.toContain('Bolsa');
    expect(names).not.toContain('Cripto');
  });
});

describe('vigência (RN-30)', () => {
  it('vale do período atual em diante; alterações não mudam os períodos anteriores', async () => {
    await put({ kind: 'CATEGORY_LIMIT', categoryId: food, amountCents: 80000 }).expect(200);

    await jumpTo('2027-01-15');
    await put({ kind: 'CATEGORY_LIMIT', categoryId: food, amountCents: 100000 }).expect(200);

    const limitIn = async (date: string) => (await get(date)).body.categoryLimits[0]?.amountCents ?? null;
    expect(await limitIn('2026-10-15')).toBeNull();
    expect(await limitIn('2026-11-15')).toBe(80000);
    expect(await limitIn('2026-12-15')).toBe(80000);
    expect(await limitIn('2027-01-15')).toBe(100000);
    expect(await limitIn('2027-03-15')).toBe(100000);
  });

  it('remover vale do período atual em diante', async () => {
    await put({ kind: 'SAVINGS_GOAL', amountCents: 50000 }).expect(200);
    await jumpTo('2026-12-20');
    await put({ kind: 'SAVINGS_GOAL', amountCents: null }).expect(200);

    expect((await get('2026-11-15')).body.savingsGoalCents).toBe(50000);
    expect((await get('2026-12-15')).body.savingsGoalCents).toBeNull();
  });

  it('passar a categoria para Investimento remove o limite dela (RN-17)', async () => {
    await put({ kind: 'CATEGORY_LIMIT', categoryId: leisure, amountCents: 30000 }).expect(200);
    await jumpTo('2026-12-10');
    await request(app).patch(`/api/categories/${leisure}`).set('Cookie', cookie).send({ expenseClass: 'INVESTMENT' }).expect(200);

    // Como os totais por classe (RN-17), o limite deixa de aparecer em todos os períodos.
    expect((await get('2026-11-15')).body.categoryLimits).toEqual([]);
    expect((await get('2026-12-15')).body.categoryLimits).toEqual([]);

    // Foi removido: voltar a categoria para Variável não traz o limite de volta.
    await request(app).patch(`/api/categories/${leisure}`).set('Cookie', cookie).send({ expenseClass: 'VARIABLE' }).expect(200);
    expect((await get('2026-12-15')).body.categoryLimits).toEqual([]);
  });

  it('excluir a categoria remove o limite dela (RN-18)', async () => {
    await put({ kind: 'CATEGORY_LIMIT', categoryId: leisure, amountCents: 30000 }).expect(200);
    await request(app).delete(`/api/categories/${leisure}`).set('Cookie', cookie).expect(204);
    expect((await get()).body.categoryLimits).toEqual([]);
  });
});

describe('orçamento e metas no painel (RN-31, RN-32, RN-34, RN-48)', () => {
  beforeEach(async () => {
    await add(500000, '2026-11-05', true, salary, 'INCOME');
    await add(50000, '2026-11-03', true, food);
    await add(20000, '2026-11-25', false, food);
    await add(150000, '2026-11-06', true, housing);
    await add(30000, '2026-11-07', true, reserve);
  });

  it('mostra consumido, comprometido, disponível e o alerta, com o nível do usuário', async () => {
    await put({ kind: 'CATEGORY_LIMIT', categoryId: food, amountCents: 80000 }).expect(200);
    await put({ kind: 'CLASS_LIMIT', expenseClass: 'FIXED', amountCents: 140000 }).expect(200);

    const { budget } = (await dashboard()).body;
    expect(budget.warningPercent).toBe(80);
    expect(budget.categories).toEqual([
      // 700 de 800 = 87,5% (exibido como 88%): passou do nível de atenção padrão (80%), sem estourar.
      expect.objectContaining({ categoryId: food, consumedCents: 50000, committedCents: 20000, availableCents: 10000, usedPercent: 88, status: 'WARNING' }),
    ]);
    expect(budget.classes).toEqual([expect.objectContaining({ expenseClass: 'FIXED', availableCents: -10000, status: 'EXCEEDED' })]);

    // Com nível de atenção 90%, os mesmos 87% deixam de ser atenção (RN-32a).
    await request(app).patch('/api/settings/preferences').set('Cookie', cookie).send({ warningPercent: 90 }).expect(200);
    expect((await dashboard()).body.budget.categories[0].status).toBe('OK');
  });

  it('avalia as metas de economia e de investimento', async () => {
    await put({ kind: 'SAVINGS_GOAL', amountCents: 250000 }).expect(200);
    await put({ kind: 'INVESTMENT_GOAL', amountCents: 50000 }).expect(200);

    const { goals } = (await dashboard()).body;
    // Resultado: 5.000 − 500 − 1.500 − 300 = 2.700; projetado: 2.700 − 200 = 2.500.
    expect(goals.savings).toMatchObject({ resultCents: 270000, projectedCents: 250000, achieved: true, projectedAchieved: true });
    expect(goals.investment).toMatchObject({ investedCents: 30000, remainingCents: 20000, achieved: false });
  });

  it('sem limites nem metas, o painel não mostra nada disso', async () => {
    const { budget, goals } = (await dashboard()).body;
    expect(budget.categories).toEqual([]);
    expect(budget.classes).toEqual([]);
    expect(goals).toEqual({ savings: null, investment: null });
  });
});

describe('nível de atenção nas configurações (RN-32a)', () => {
  it('aceita de 0% a 100%, com padrão 80%', async () => {
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.body.user.warningPercent).toBe(80);

    const patch = (warningPercent: unknown) =>
      request(app).patch('/api/settings/preferences').set('Cookie', cookie).send({ warningPercent });
    expect((await patch(-1)).status).toBe(400);
    expect((await patch(101)).status).toBe(400);
    expect((await patch(12.5)).status).toBe(400);
    expect((await patch(0)).status).toBe(200);
    expect((await patch(100)).body.user.warningPercent).toBe(100);
  });
});
