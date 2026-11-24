import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createVerifiedUser, paymentMethodIdOf, resetDatabase } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const app = createApp();
let cookie: string;
let food: number;
let salary: number;

type Method = { id: number; kind: string; name: string; selectable: boolean; custom: boolean };

const methods = async (sessionCookie = cookie): Promise<Method[]> =>
  (await request(app).get('/api/payment-methods').set('Cookie', sessionCookie).expect(200)).body.paymentMethods;
const createMethod = (name: string, sessionCookie = cookie) =>
  request(app).post('/api/payment-methods').set('Cookie', sessionCookie).send({ name });
const renameMethod = (id: number, name: string, sessionCookie = cookie) =>
  request(app).patch(`/api/payment-methods/${id}`).set('Cookie', sessionCookie).send({ name });
const deleteMethod = (id: number, query = '', sessionCookie = cookie) =>
  request(app).delete(`/api/payment-methods/${id}${query}`).set('Cookie', sessionCookie);

const createCard = (body: object = {}) =>
  request(app)
    .post('/api/cards')
    .set('Cookie', cookie)
    .send({ name: 'Cartão principal', color: 'purple', limitCents: 500000, closingDay: 25, dueDay: 2, ...body });
const createEntry = (body: object) => request(app).post('/api/entries').set('Cookie', cookie).send(body);
const updateEntry = (id: number, body: object) => request(app).put(`/api/entries/${id}`).set('Cookie', cookie).send(body);
const expense = (body: object) => ({ type: 'EXPENSE', amountCents: 5000, date: '2026-11-10', categoryId: food, ...body });

async function categoryId(name: string): Promise<number> {
  const response = await request(app).get('/api/categories').set('Cookie', cookie);
  return (response.body.categories as { id: number; name: string }[]).find((c) => c.name === name)!.id;
}

beforeEach(async () => {
  await resetDatabase();
  cookie = await createVerifiedUser(app);
  food = await categoryId('Alimentação');
  salary = await categoryId('Salário');
});

describe('formas padrão (RN-68, RN-70)', () => {
  it('toda conta nova tem as cinco formas padrão, e a "Não informada" por último, sem poder ser escolhida', async () => {
    const list = await methods();
    expect(list.map((m) => m.name)).toEqual(['Pix', 'Débito', 'Crédito', 'Dinheiro', 'Boleto', 'Não informada']);
    expect(list.filter((m) => !m.selectable).map((m) => m.kind)).toEqual(['UNSPECIFIED']);
    expect(list.some((m) => m.custom)).toBe(false);
  });

  it('as formas padrão não podem ser renomeadas nem excluídas', async () => {
    const pix = await paymentMethodIdOf(app, cookie);
    expect((await renameMethod(pix, 'Pix do banco')).body.error.code).toBe('DEFAULT_PAYMENT_METHOD');
    expect((await deleteMethod(pix)).status).toBe(400);
  });
});

describe('formas personalizadas (RN-69)', () => {
  it('cria, renomeia e lista depois das padrão', async () => {
    const created = await createMethod('  Vale-refeição  ');
    expect(created.status).toBe(201);
    expect(created.body.paymentMethod).toMatchObject({ name: 'Vale-refeição', kind: 'CUSTOM', custom: true, selectable: true });

    expect((await renameMethod(created.body.paymentMethod.id, 'VR')).body.paymentMethod.name).toBe('VR');
    expect((await methods()).map((m) => m.name).slice(-2)).toEqual(['VR', 'Não informada']);
  });

  it('nome de 1 a 30 caracteres e único, inclusive com as padrão', async () => {
    expect((await createMethod('   ')).status).toBe(400);
    expect((await createMethod('x'.repeat(31))).status).toBe(400);
    const duplicate = await createMethod(' PIX ');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.fields[0].path).toBe('name');
    expect((await createMethod('Não informada')).status).toBe(409);
  });

  it('no máximo 10 personalizadas', async () => {
    for (let i = 0; i < 10; i++) expect((await createMethod(`Forma ${i}`)).status).toBe(201);
    expect((await createMethod('Uma a mais')).body.error.code).toBe('PAYMENT_METHOD_LIMIT_REACHED');
  });

  it('exclui sem lançamentos; com lançamentos, move para outra forma e exclui de uma vez', async () => {
    const vr = (await createMethod('Vale-refeição')).body.paymentMethod.id;
    const empty = (await createMethod('Sem uso')).body.paymentMethod.id;
    expect((await deleteMethod(empty)).status).toBe(204);

    const entry = (await createEntry(expense({ paymentMethodId: vr }))).body.entry;
    const blocked = await deleteMethod(vr);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PAYMENT_METHOD_HAS_ENTRIES');

    const cash = await paymentMethodIdOf(app, cookie, 'CASH');
    expect((await deleteMethod(vr, `?moveTo=${cash}`)).status).toBe(204);
    const moved = await request(app).get('/api/entries?start=2026-11-01&end=2026-11-30').set('Cookie', cookie);
    expect(moved.body.entries.find((e: { id: number }) => e.id === entry.id).paymentMethodId).toBe(cash);
  });

  it('não move para Crédito (exigiria cartão) nem para a "Não informada"', async () => {
    const vr = (await createMethod('Vale-refeição')).body.paymentMethod.id;
    await createEntry(expense({ paymentMethodId: vr })).expect(201);
    for (const kind of ['CREDIT', 'UNSPECIFIED']) {
      const target = await paymentMethodIdOf(app, cookie, kind);
      expect((await deleteMethod(vr, `?moveTo=${target}`)).body.error.code).toBe('INVALID_MOVE_TARGET');
    }
  });

  it('cada usuário vê e altera só as próprias formas (RN-04)', async () => {
    const vr = (await createMethod('Vale-refeição')).body.paymentMethod.id;
    const other = await createVerifiedUser(app, 'outro@example.com');
    expect((await methods(other)).some((m) => m.id === vr)).toBe(false);
    expect((await renameMethod(vr, 'Invadido', other)).status).toBe(404);
    expect((await deleteMethod(vr, '', other)).status).toBe(404);
  });
});

describe('forma de pagamento nos lançamentos (RN-67, RN-70)', () => {
  it('é obrigatória nas despesas', async () => {
    const missing = await createEntry(expense({}));
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields[0]).toEqual({ path: 'paymentMethodId', message: 'Escolha a forma de pagamento.' });
    expect((await createEntry(expense({ paymentMethodId: await paymentMethodIdOf(app, cookie, 'DEBIT') }))).status).toBe(201);
  });

  it('receitas não têm forma de pagamento nem cartão', async () => {
    const income = { type: 'INCOME', amountCents: 5000, date: '2026-11-10', categoryId: salary };
    expect((await createEntry({ ...income, paymentMethodId: await paymentMethodIdOf(app, cookie) })).status).toBe(400);
    const created = await createEntry(income);
    expect(created.status).toBe(201);
    expect(created.body.entry).toMatchObject({ paymentMethodId: null, cardId: null });
  });

  it('não aceita forma de outro usuário', async () => {
    const other = await createVerifiedUser(app, 'outro@example.com');
    const foreign = await paymentMethodIdOf(app, other);
    expect((await createEntry(expense({ paymentMethodId: foreign }))).body.error.code).toBe('INVALID_PAYMENT_METHOD');
  });

  it('a "Não informada" não pode ser escolhida, mas uma despesa antiga a mantém ao ser editada e repetida', async () => {
    const unspecified = await paymentMethodIdOf(app, cookie, 'UNSPECIFIED');
    expect((await createEntry(expense({ paymentMethodId: unspecified }))).status).toBe(400);

    // Simula uma despesa de antes da RN-67, como a migration deixa.
    const pix = await paymentMethodIdOf(app, cookie);
    const entry = (await createEntry(expense({ paymentMethodId: pix }))).body.entry;
    const { prisma } = await import('../src/lib/prisma.js');
    await prisma.entry.update({ where: { id: entry.id }, data: { paymentMethodId: unspecified } });

    const edited = await updateEntry(entry.id, expense({ paymentMethodId: unspecified, description: 'Mercado' }));
    expect(edited.status).toBe(200);
    const copies = (await request(app).post(`/api/entries/${entry.id}/repeat`).set('Cookie', cookie).send({ times: 1 })).body.entries;
    expect(copies[0].paymentMethodId).toBe(unspecified);

    // Trocar por uma forma de verdade é sempre possível.
    expect((await updateEntry(entry.id, expense({ paymentMethodId: pix }))).body.entry.paymentMethodId).toBe(pix);
  });

  it('filtra a lista por forma de pagamento e por cartão (RN-71)', async () => {
    const pix = await paymentMethodIdOf(app, cookie);
    const credit = await paymentMethodIdOf(app, cookie, 'CREDIT');
    const card = (await createCard()).body.card.id;
    await createEntry(expense({ paymentMethodId: pix, amountCents: 100 })).expect(201);
    await createEntry(expense({ paymentMethodId: credit, cardId: card, amountCents: 200 })).expect(201);

    const list = (query: string) => request(app).get(`/api/entries?start=2026-11-01&end=2026-11-30&${query}`).set('Cookie', cookie);
    expect((await list(`paymentMethodId=${pix}`)).body.entries.map((e: { amountCents: number }) => e.amountCents)).toEqual([100]);
    const byCard = (await list(`cardId=${card}`)).body;
    expect(byCard.entries.map((e: { amountCents: number }) => e.amountCents)).toEqual([200]);
    // RN-54: a compra no cartão fica pendente até a fatura ser paga.
    expect(byCard.totals.expensePending).toBe(200);
  });
});
