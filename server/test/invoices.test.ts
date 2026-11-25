import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createVerifiedUser, paymentMethodIdOf, resetDatabase } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const app = createApp();
let cookie: string;
let food: number;
let leisure: number;
let credit: number;
let pix: number;
let boleto: number;
let card: number; // fecha dia 23, vence dia 2 (o exemplo da RN-53)

type Entry = { id: number; date: string; payDate: string; paid: boolean; amountCents: number; categoryId: number; installment: { number: number; count: number } | null };

const post = (body: object) => request(app).post('/api/entries').set('Cookie', cookie).send(body);
const put = (id: number, body: object) => request(app).put(`/api/entries/${id}`).set('Cookie', cookie).send(body);
const purchase = (body: object = {}) => ({ type: 'EXPENSE', amountCents: 20000, date: '2026-11-24', categoryId: food, paymentMethodId: credit, cardId: card, ...body });
const invoices = async () => (await request(app).get(`/api/cards/${card}/invoices`).set('Cookie', cookie).expect(200)).body.invoices;
const payInvoice = (due: string, paid = true) => request(app).patch(`/api/cards/${card}/invoices/${due}`).set('Cookie', cookie).send({ paid });
const listEntries = async (start: string, end: string): Promise<Entry[]> =>
  (await request(app).get(`/api/entries?start=${start}&end=${end}`).set('Cookie', cookie).expect(200)).body.entries;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T15:00:00Z'));
  await resetDatabase();
  cookie = await createVerifiedUser(app);
  const categories = (await request(app).get('/api/categories').set('Cookie', cookie)).body.categories as { id: number; name: string }[];
  food = categories.find((c) => c.name === 'Alimentação')!.id;
  leisure = categories.find((c) => c.name === 'Lazer')!.id;
  credit = await paymentMethodIdOf(app, cookie, 'CREDIT');
  pix = await paymentMethodIdOf(app, cookie);
  boleto = await paymentMethodIdOf(app, cookie, 'BOLETO');
  card = (
    await request(app)
      .post('/api/cards')
      .set('Cookie', cookie)
      .send({ name: 'Cartão principal', color: 'purple', limitCents: 100000, closingDay: 23, dueDay: 2 })
      .expect(201)
  ).body.card.id;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fatura da compra (RN-53, RN-53a)', () => {
  it('até o dia do fechamento entra na fatura que fecha nele; depois, na seguinte', async () => {
    expect((await post(purchase({ date: '2026-11-23' }))).body.entry.payDate).toBe('2026-12-02');
    expect((await post(purchase({ date: '2026-11-24' }))).body.entry.payDate).toBe('2027-01-02');
  });

  it('à vista, a data de pagamento é a própria data', async () => {
    expect((await post(purchase({ paymentMethodId: pix, cardId: null }))).body.entry.payDate).toBe('2026-11-24');
  });

  it('mudar o fechamento do cartão não muda as compras já registradas; editar a data recalcula', async () => {
    const entry = (await post(purchase({ date: '2026-11-20' }))).body.entry;
    expect(entry.payDate).toBe('2026-12-02');
    await request(app).patch(`/api/cards/${card}`).set('Cookie', cookie).send({ closingDay: 15 }).expect(200);

    // Mudar só a descrição mantém a fatura gravada.
    expect((await put(entry.id, purchase({ date: '2026-11-20', description: 'Mercado' }))).body.entry.payDate).toBe('2026-12-02');
    // Mudar a data recalcula com o fechamento atual (dia 15): 18/11 vai para a fatura que fecha em 15/12.
    expect((await put(entry.id, purchase({ date: '2026-11-18' }))).body.entry.payDate).toBe('2027-01-02');
  });
});

describe('gastos x a pagar (RN-52a)', () => {
  it('a compra conta nos gastos do mês dela e no a pagar do mês da fatura', async () => {
    await post(purchase({ date: '2026-11-24', amountCents: 20000 })).expect(201); // fatura de janeiro
    await post(purchase({ date: '2026-11-10', amountCents: 5000 })).expect(201); // fatura de dezembro
    await post(purchase({ paymentMethodId: pix, cardId: null, date: '2026-11-05', amountCents: 1000 })).expect(201);

    // Lançamentos: pela data da compra.
    expect((await listEntries('2026-11-01', '2026-11-30')).map((e) => e.amountCents).sort()).toEqual([1000, 20000, 5000]);

    const dashboard = async (date: string) => (await request(app).get(`/api/dashboard?date=${date}`).set('Cookie', cookie)).body;
    const november = await dashboard('2026-11-24');
    expect(november.totals).toMatchObject({ spentCents: 26000, toPayCents: 1000, expensePaid: 1000 });
    expect(november.byCategory[0]).toMatchObject({ name: 'Alimentação', totalCents: 26000 });

    const december = await dashboard('2026-12-15');
    expect(december.totals).toMatchObject({ spentCents: 0, toPayCents: 5000, expensePending: 5000 });
    const january = await dashboard('2027-01-15');
    expect(january.totals).toMatchObject({ toPayCents: 20000 });
  });

  it('o saldo acumulado considera a compra quando a fatura é paga, no mês do vencimento', async () => {
    await post(purchase({ date: '2026-11-10', amountCents: 5000 })).expect(201);
    await payInvoice('2026-12-02').expect(204);
    const balance = async (date: string) => (await request(app).get(`/api/dashboard?date=${date}`).set('Cookie', cookie)).body.balance.currentCents;
    expect(await balance('2026-11-15')).toBe(0);
    expect(await balance('2026-12-15')).toBe(-5000);
  });
});

describe('pagar a fatura (RN-54) e situação (RN-53b)', () => {
  it('as compras não têm check próprio; a fatura marca e desmarca todas', async () => {
    const a = (await post(purchase({ date: '2026-11-05' }))).body.entry;
    const b = (await post(purchase({ date: '2026-11-15' }))).body.entry;
    expect(a.paid).toBe(false);
    expect((await request(app).patch(`/api/entries/${a.id}/paid`).set('Cookie', cookie).send({ paid: true })).body.error.code).toBe('PAID_BY_INVOICE');

    await payInvoice('2026-12-02').expect(204);
    const paid = await listEntries('2026-11-01', '2026-11-30');
    expect(paid.filter((e) => [a.id, b.id].includes(e.id)).every((e) => e.paid)).toBe(true);

    await payInvoice('2026-12-02', false).expect(204);
    expect((await listEntries('2026-11-01', '2026-11-30')).every((e) => !e.paid)).toBe(true);
  });

  it('uma compra nova numa fatura paga a reabre, com aviso', async () => {
    await post(purchase({ date: '2026-11-05' })).expect(201);
    await payInvoice('2026-12-02').expect(204);
    const late = await post(purchase({ date: '2026-11-20' }));
    expect(late.body.warning).toMatch(/já estava paga/);
    expect((await invoices()).find((i: { due: string }) => i.due === '2026-12-02').status).toBe('CLOSED');
  });

  it('lista as faturas com situação, total e compras', async () => {
    await post(purchase({ date: '2026-10-10', amountCents: 3000 })).expect(201); // vence 02/11: atrasada
    await post(purchase({ date: '2026-11-10', amountCents: 4000 })).expect(201); // vence 02/12: fechada (fechou 23/11)
    await post(purchase({ date: '2026-11-24', amountCents: 5000 })).expect(201); // vence 02/01: aberta
    const list = await invoices();
    expect(list.map((i: { due: string; status: string; totalCents: number }) => [i.due, i.status, i.totalCents])).toEqual([
      ['2027-01-02', 'OPEN', 5000],
      ['2026-12-02', 'CLOSED', 4000],
      ['2026-11-02', 'OVERDUE', 3000],
    ]);
    await payInvoice('2026-11-02').expect(204);
    expect((await invoices()).at(-1).status).toBe('PAID');
  });

  it('nas Contas do mês, a fatura é um item só, no mês do vencimento (RN-50d)', async () => {
    await post(purchase({ date: '2026-11-05', amountCents: 3000 })).expect(201);
    await post(purchase({ date: '2026-11-15', amountCents: 4000 })).expect(201);
    const december = (await request(app).get('/api/bills?date=2026-12-10').set('Cookie', cookie)).body;
    expect(december.expenses).toHaveLength(1);
    expect(december.expenses[0]).toMatchObject({ amountCents: 7000, paid: false, invoice: { cardId: card, due: '2026-12-02', count: 2 } });
    expect(december.progress).toMatchObject({ paidCount: 0, totalCount: 1, pendingCents: 7000 });
    expect((await request(app).get('/api/bills?date=2026-11-10').set('Cookie', cookie)).body.expenses).toEqual([]);
  });

  it('fatura de outro usuário não pode ser paga (RN-04)', async () => {
    await post(purchase({ date: '2026-11-05' })).expect(201);
    const other = await createVerifiedUser(app, 'outro@example.com');
    expect((await request(app).patch(`/api/cards/${card}/invoices/2026-12-02`).set('Cookie', other).send({ paid: true })).status).toBe(404);
  });
});

describe('limite do cartão (RN-55)', () => {
  it('soma o que não foi pago, inclusive faturas futuras, com o alerta do orçamento', async () => {
    await post(purchase({ date: '2026-11-05', amountCents: 30000 })).expect(201);
    await post(purchase({ date: '2026-11-24', amountCents: 55000 })).expect(201);
    const cardOf = async () => (await request(app).get('/api/cards').set('Cookie', cookie)).body.cards[0];
    expect(await cardOf()).toMatchObject({ usedCents: 85000, availableCents: 15000, usageStatus: 'WARNING' });

    await payInvoice('2026-12-02').expect(204);
    expect(await cardOf()).toMatchObject({ usedCents: 55000, availableCents: 45000, usageStatus: 'OK' });

    await post(purchase({ date: '2026-11-24', amountCents: 50000 })).expect(201);
    expect(await cardOf()).toMatchObject({ availableCents: -5000, usageStatus: 'EXCEEDED' });
  });
});

describe('parcelamento (RN-56, RN-56a)', () => {
  it('pelo total: divide em centavos e põe a sobra na primeira; cada parcela na sua fatura', async () => {
    const response = await post(purchase({ amountCents: 10000, date: '2026-11-20', installments: { count: 3, mode: 'TOTAL' } }));
    expect(response.status).toBe(201);
    const parcels: Entry[] = response.body.entries;
    expect(parcels.map((p) => [p.amountCents, p.date, p.payDate, p.installment!.number, p.installment!.count])).toEqual([
      [3334, '2026-11-20', '2026-12-02', 1, 3],
      [3333, '2026-12-20', '2027-01-02', 2, 3],
      [3333, '2027-01-20', '2027-02-02', 3, 3],
    ]);
  });

  it('pela parcela, com juros: total = parcela × número de parcelas; pode passar de 12 meses', async () => {
    const parcels: Entry[] = (
      await post({ type: 'EXPENSE', amountCents: 125000, date: '2026-11-10', categoryId: food, paymentMethodId: boleto, installments: { count: 360, mode: 'INSTALLMENT' } })
    ).body.entries;
    expect(parcels).toHaveLength(360);
    expect(parcels.every((p) => p.amountCents === 125000)).toBe(true);
    expect(parcels.at(-1)!.date).toBe('2056-10-10');
    // À vista, cada parcela tem o próprio check: as futuras nascem pendentes.
    expect(parcels[0]!.paid).toBe(true);
    expect(parcels[1]!.paid).toBe(false);
  });

  it('de 2 a 480 parcelas; a primeira segue o limite de 12 meses', async () => {
    const installments = (count: number) => post(purchase({ installments: { count, mode: 'TOTAL' } }));
    expect((await installments(1)).status).toBe(400);
    expect((await installments(481)).status).toBe(400);
    expect((await installments(480)).status).toBe(201);
    expect((await post(purchase({ date: '2028-01-10', installments: { count: 2, mode: 'TOTAL' } }))).status).toBe(400);
  });

  it('alterar uma parcela altera todas: valor, categoria, descrição e data', async () => {
    const parcels: Entry[] = (await post(purchase({ amountCents: 9000, date: '2026-11-20', installments: { count: 3, mode: 'TOTAL' } }))).body.entries;
    const second = parcels[1]!;
    const edited = await put(second.id, purchase({ amountCents: 4000, categoryId: leisure, description: 'Sofá', date: '2027-01-05' }));
    expect(edited.status).toBe(200);

    const all = (await listEntries('2026-01-01', '2027-12-31')).filter((e) => e.installment);
    expect(all.map((e) => [e.date, e.payDate, e.amountCents, e.categoryId])).toEqual([
      ['2027-02-05', '2027-03-02', 4000, leisure],
      ['2027-01-05', '2027-02-02', 4000, leisure],
      ['2026-12-05', '2027-01-02', 4000, leisure],
    ]);
  });

  it('mudar o valor num parcelamento pelo total deixa todas iguais: total = parcela × parcelas', async () => {
    const parcels: Entry[] = (await post(purchase({ amountCents: 10000, installments: { count: 3, mode: 'TOTAL' } }))).body.entries;
    expect(parcels.map((p) => p.amountCents)).toEqual([3334, 3333, 3333]);
    await put(parcels[1]!.id, purchase({ amountCents: 3500 })).expect(200);
    const all = (await listEntries('2026-01-01', '2027-12-31')).filter((e) => e.installment);
    expect(all.map((e) => e.amountCents)).toEqual([3500, 3500, 3500]);
  });

  it('a parcela editada fica com a data informada; as demais, no mesmo dia do mês ou no último dia', async () => {
    const boletoPurchase = (body: object) => purchase({ paymentMethodId: boleto, cardId: null, ...body });
    const parcels: Entry[] = (await post(boletoPurchase({ date: '2026-01-31', installments: { count: 3, mode: 'TOTAL' } }))).body.entries;
    expect(parcels.map((p) => p.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);

    const dates = async () => (await listEntries('2026-01-01', '2026-12-31')).map((e) => e.date).sort();
    await put(parcels[2]!.id, boletoPurchase({ date: '2026-03-30' })).expect(200);
    expect(await dates()).toEqual(['2026-01-30', '2026-02-28', '2026-03-30']);

    await put(parcels[1]!.id, boletoPurchase({ date: '2026-02-27' })).expect(200);
    expect(await dates()).toEqual(['2026-01-27', '2026-02-27', '2026-03-27']);
  });

  it('uma parcela mais de 12 meses à frente pode ser editada', async () => {
    const parcels: Entry[] = (await post(purchase({ installments: { count: 24, mode: 'TOTAL' } }))).body.entries;
    const last = parcels.at(-1)!;
    expect((await put(last.id, purchase({ date: last.date, description: 'TV' }))).status).toBe(200);
  });

  it('excluir uma parcela exclui o parcelamento inteiro; parcelas não podem ser repetidas', async () => {
    const parcels: Entry[] = (await post(purchase({ installments: { count: 4, mode: 'TOTAL' } }))).body.entries;
    expect((await request(app).post(`/api/entries/${parcels[0]!.id}/repeat`).set('Cookie', cookie).send({ times: 1 })).body.error.code).toBe(
      'INSTALLMENT_REPEAT',
    );
    await request(app).delete(`/api/entries/${parcels[2]!.id}`).set('Cookie', cookie).expect(204);
    expect((await listEntries('2026-01-01', '2027-12-31')).length).toBe(0);
  });
});
