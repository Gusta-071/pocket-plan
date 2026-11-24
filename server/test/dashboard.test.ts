import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createVerifiedUser, paymentMethodIdOf, resetDatabase } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const app = createApp();
let cookie: string;
let pix: number;
let food: number;
let leisure: number;
let salary: number;

// "Hoje" fixo em 24/11/2026, meio-dia em São Paulo: as contas do painel dependem da data.
const TODAY = '2026-11-24';

const dashboard = (date?: string, sessionCookie = cookie) =>
  request(app).get(`/api/dashboard${date ? `?date=${date}` : ''}`).set('Cookie', sessionCookie);

async function add(type: 'INCOME' | 'EXPENSE', amountCents: number, date: string, paid: boolean, categoryId = type === 'INCOME' ? salary : food) {
  await request(app).post('/api/entries').set('Cookie', cookie).send({ type, amountCents, date, categoryId, paid, paymentMethodId: type === 'EXPENSE' ? pix : null }).expect(201);
}

async function categoryId(name: string): Promise<number> {
  const response = await request(app).get('/api/categories').set('Cookie', cookie);
  return (response.body.categories as { id: number; name: string }[]).find((c) => c.name === name)!.id;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  await resetDatabase();
  cookie = await createVerifiedUser(app);
  pix = await paymentMethodIdOf(app, cookie);
  food = await categoryId('Alimentação');
  leisure = await categoryId('Lazer');
  salary = await categoryId('Salário');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resumo do período (RN-26 a RN-28a, RN-48)', () => {
  beforeEach(async () => {
    await request(app).patch('/api/settings/preferences').set('Cookie', cookie).send({ initialBalanceCents: 1000 }).expect(200);
    await add('INCOME', 5000, '2026-10-05', true);
    await add('EXPENSE', 2000, '2026-10-10', true);
    await add('EXPENSE', 300, '2026-10-20', false); // atrasada, de outubro
    await add('INCOME', 6000, '2026-11-05', true);
    await add('EXPENSE', 1000, '2026-11-10', true);
    await add('EXPENSE', 500, '2026-11-28', false); // pendente, ainda no período
    await add('EXPENSE', 9999, '2026-12-03', false); // fora do período
  });

  it('sem data, mostra o período atual', async () => {
    const { period } = (await dashboard()).body;
    expect(period).toMatchObject({ start: '2026-11-01', end: '2026-11-30', label: 'Novembro/2026', isCurrent: true });
  });

  it('calcula pago, pendente, resultado e projetado', async () => {
    const { totals } = (await dashboard(TODAY)).body;
    expect(totals).toEqual({ incomePaid: 6000, incomePending: 0, expensePaid: 1000, expensePending: 500, result: 5000, projected: 4500 });
  });

  it('acumula o saldo a partir do saldo inicial (RN-28a)', async () => {
    const { balance } = (await dashboard(TODAY)).body;
    // Veio de antes: 1000 + 5000 − 2000. A atrasada de outubro ainda não saiu.
    expect(balance.previousCents).toBe(4000);
    expect(balance.currentCents).toBe(9000);
    // Projetado: tira a pendente de novembro e a atrasada de outubro, mas não a de dezembro.
    expect(balance.projectedCents).toBe(8200);
  });

  it('pagar uma conta antiga muda o saldo dos períodos seguintes', async () => {
    const overdue = (await dashboard(TODAY)).body.overdue.entries[0];
    await request(app).patch(`/api/entries/${overdue.id}/paid`).set('Cookie', cookie).send({ paid: true }).expect(200);

    const { balance } = (await dashboard(TODAY)).body;
    expect(balance.previousCents).toBe(3700);
    expect(balance.currentCents).toBe(8700);
  });

  it('lista as atrasadas de qualquer período e as pendentes dos próximos 7 dias (RN-22a)', async () => {
    await add('EXPENSE', 50, '2026-12-01', false); // 7 dias depois de hoje: entra
    await add('EXPENSE', 60, '2026-12-02', false); // 8 dias: não entra

    const { overdue, upcoming } = (await dashboard(TODAY)).body;
    expect(overdue).toMatchObject({ count: 1, expenseCents: 300, incomeCents: 0 });
    expect(overdue.entries[0]).toMatchObject({ date: '2026-10-20', overdue: true });
    expect(upcoming.map((e: { amountCents: number }) => e.amountCents)).toEqual([500, 50]);
  });
});

describe('gastos por classe (RN-14a, RN-28, RN-48)', () => {
  it('separa fixos, variáveis e investido, e o aporte entra no resultado', async () => {
    const housing = await categoryId('Moradia');
    const reserve = await categoryId('Reserva de emergência');
    await add('INCOME', 10000, '2026-11-05', true);
    await add('EXPENSE', 3000, '2026-11-06', true, housing);
    await add('EXPENSE', 800, '2026-11-07', true, food);
    await add('EXPENSE', 200, '2026-11-26', false, leisure);
    await add('EXPENSE', 1500, '2026-11-08', true, reserve);

    const { byClass, totals, byCategory } = (await dashboard(TODAY)).body;
    expect(byClass).toEqual([
      expect.objectContaining({ expenseClass: 'FIXED', totalCents: 3000, paidCents: 3000, pendingCents: 0 }),
      expect.objectContaining({ expenseClass: 'VARIABLE', totalCents: 1000, paidCents: 800, pendingCents: 200 }),
      expect.objectContaining({ expenseClass: 'INVESTMENT', totalCents: 1500, paidCents: 1500, pendingCents: 0 }),
    ]);
    // O aporte é dinheiro que saiu: entra no resultado (RN-26, RN-28).
    expect(totals.result).toBe(10000 - 3000 - 800 - 1500);
    expect(byCategory.find((c: { name: string }) => c.name === 'Reserva de emergência').expenseClass).toBe('INVESTMENT');
  });

  it('trocar a classe da categoria muda os totais, inclusive de períodos passados (RN-17)', async () => {
    await add('EXPENSE', 700, '2026-10-15', true, leisure);
    await request(app).patch(`/api/categories/${leisure}`).set('Cookie', cookie).send({ expenseClass: 'FIXED' }).expect(200);

    const { byClass } = (await dashboard('2026-10-15')).body;
    expect(byClass[0]).toMatchObject({ expenseClass: 'FIXED', totalCents: 700 });
    expect(byClass[1]).toMatchObject({ expenseClass: 'VARIABLE', totalCents: 0 });
  });

  it('compara cada classe com o período anterior (RN-49)', async () => {
    await add('EXPENSE', 400, '2026-10-03', true, food);
    await add('EXPENSE', 600, '2026-11-03', true, food);

    const variable = (await dashboard(TODAY)).body.byClass[1];
    expect(variable.comparison).toEqual({ currentCents: 600, previousCents: 400 });
  });
});

describe('comparação com o período anterior (RN-49)', () => {
  it('no período atual, compara com o anterior até o mesmo dia', async () => {
    await add('EXPENSE', 200, '2026-10-05', true);
    await add('EXPENSE', 400, '2026-10-28', true); // depois do dia 24: fora da comparação
    await add('EXPENSE', 300, '2026-11-05', true);
    await add('EXPENSE', 700, '2026-11-27', false); // futura: conta no total, não na comparação

    const { byCategory, expenseComparison, period } = (await dashboard(TODAY)).body;
    expect(period.comparisonDay).toBe(23);
    expect(expenseComparison).toEqual({ currentCents: 300, previousCents: 200 });
    expect(byCategory[0]).toMatchObject({ categoryId: food, totalCents: 1000, pendingCents: 700, comparison: { currentCents: 300, previousCents: 200 } });
  });

  it('em período encerrado, compara os dois inteiros', async () => {
    await add('EXPENSE', 200, '2026-09-05', true);
    await add('EXPENSE', 400, '2026-09-28', true);
    await add('EXPENSE', 300, '2026-10-29', true);

    const { expenseComparison, period } = (await dashboard('2026-10-15')).body;
    expect(period).toMatchObject({ start: '2026-10-01', isCurrent: false, comparisonDay: null });
    expect(expenseComparison).toEqual({ currentCents: 300, previousCents: 600 });
  });

  it('ordena as categorias pelo gasto e mostra as que só tiveram gasto antes', async () => {
    await add('EXPENSE', 100, '2026-11-02', true, food);
    await add('EXPENSE', 900, '2026-11-03', true, leisure);
    await add('EXPENSE', 50, '2026-10-02', true, await categoryId('Saúde'));

    const names = (await dashboard(TODAY)).body.byCategory.map((c: { name: string }) => c.name);
    expect(names).toEqual(['Lazer', 'Alimentação', 'Saúde']);
  });
});

describe('evolução e acesso', () => {
  it('traz receitas e despesas dos últimos 6 períodos', async () => {
    await add('INCOME', 1000, '2026-06-10', true);
    await add('EXPENSE', 400, '2026-11-10', false);

    const { evolution } = (await dashboard(TODAY)).body;
    expect(evolution.map((p: { label: string }) => p.label)).toEqual([
      'Junho/2026',
      'Julho/2026',
      'Agosto/2026',
      'Setembro/2026',
      'Outubro/2026',
      'Novembro/2026',
    ]);
    expect(evolution[0]).toMatchObject({ incomeCents: 1000, expenseCents: 0 });
    expect(evolution[5]).toMatchObject({ incomeCents: 0, expenseCents: 400 });
  });

  it('segue o dia de início do mês financeiro (RN-11)', async () => {
    await request(app).patch('/api/settings/preferences').set('Cookie', cookie).send({ monthStartDay: 5 }).expect(200);
    const { period } = (await dashboard(TODAY)).body;
    expect(period).toMatchObject({ start: '2026-11-05', end: '2026-12-04' });
  });

  it('mostra só os dados do próprio usuário (RN-04) e exige login', async () => {
    await add('INCOME', 1000, '2026-11-10', true);
    const other = await createVerifiedUser(app, 'outro@example.com');

    expect((await dashboard(TODAY, other)).body.totals.incomePaid).toBe(0);
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
    expect((await dashboard('2026-13-01')).status).toBe(400);
  });
});
