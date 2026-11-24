import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createVerifiedUser, paymentMethodIdOf, resetDatabase } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const app = createApp();
let cookie: string;
let food: number;
let credit: number;
let pix: number;

const card = (body: object = {}) => ({ name: 'Cartão principal', color: 'purple', limitCents: 500000, closingDay: 25, dueDay: 2, ...body });
const createCard = (body: object = {}, sessionCookie = cookie) => request(app).post('/api/cards').set('Cookie', sessionCookie).send(card(body));
const updateCard = (id: number, body: object, sessionCookie = cookie) => request(app).patch(`/api/cards/${id}`).set('Cookie', sessionCookie).send(body);
const deleteCard = (id: number, sessionCookie = cookie) => request(app).delete(`/api/cards/${id}`).set('Cookie', sessionCookie);
const listCards = async () => (await request(app).get('/api/cards').set('Cookie', cookie).expect(200)).body.cards as { id: number; name: string; archived: boolean }[];
const createEntry = (body: object) => request(app).post('/api/entries').set('Cookie', cookie).send(body);
const purchase = (body: object = {}) => ({ type: 'EXPENSE', amountCents: 5000, date: '2026-11-10', categoryId: food, paymentMethodId: credit, ...body });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-24T15:00:00Z'));
  await resetDatabase();
  cookie = await createVerifiedUser(app);
  const categories = (await request(app).get('/api/categories').set('Cookie', cookie)).body.categories as { id: number; name: string }[];
  food = categories.find((c) => c.name === 'Alimentação')!.id;
  credit = await paymentMethodIdOf(app, cookie, 'CREDIT');
  pix = await paymentMethodIdOf(app, cookie);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cadastro (RN-51)', () => {
  it('cria com nome, cor, limite, fechamento e vencimento', async () => {
    const response = await createCard({ name: '  Cartão principal  ' });
    expect(response.status).toBe(201);
    expect(response.body.card).toMatchObject({ name: 'Cartão principal', color: 'purple', limitCents: 500000, closingDay: 25, dueDay: 2, archived: false });
  });

  it('valida cada campo', async () => {
    expect((await createCard({ name: '' })).status).toBe(400);
    expect((await createCard({ name: 'x'.repeat(31) })).status).toBe(400);
    expect((await createCard({ color: '#000' })).status).toBe(400);
    expect((await createCard({ limitCents: 0 })).status).toBe(400);
    expect((await createCard({ closingDay: 0 })).status).toBe(400);
    expect((await createCard({ dueDay: 32 })).status).toBe(400);
  });

  it('nome único entre os cartões do usuário, sem diferenciar maiúsculas', async () => {
    await createCard().expect(201);
    const duplicate = await createCard({ name: 'CARTÃO PRINCIPAL' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.fields[0].path).toBe('name');
    expect((await createCard({}, await createVerifiedUser(app, 'outro@example.com'))).status).toBe(201);
  });

  it('no máximo 10 cartões', async () => {
    for (let i = 0; i < 10; i++) expect((await createCard({ name: `Cartão ${i}` })).status).toBe(201);
    expect((await createCard({ name: 'Mais um' })).body.error.code).toBe('CARD_LIMIT_REACHED');
  });

  it('edita os dados; de outro usuário, responde como inexistente (RN-04)', async () => {
    const id = (await createCard()).body.card.id;
    expect((await updateCard(id, { limitCents: 800000, dueDay: 5 })).body.card).toMatchObject({ limitCents: 800000, dueDay: 5 });
    expect((await updateCard(id, { name: 'Invadido' }, await createVerifiedUser(app, 'outro@example.com'))).status).toBe(404);
  });
});

describe('compra no cartão (RN-52)', () => {
  it('no crédito, o cartão é obrigatório', async () => {
    const id = (await createCard()).body.card.id;
    expect((await createEntry(purchase())).body.error.code).toBe('CARD_REQUIRED');
    expect((await createEntry(purchase({ cardId: id }))).body.entry).toMatchObject({ paymentMethodId: credit, cardId: id });
  });

  it('nas outras formas, não há cartão', async () => {
    const id = (await createCard()).body.card.id;
    expect((await createEntry(purchase({ paymentMethodId: pix, cardId: id }))).body.error.code).toBe('CARD_ONLY_ON_CREDIT');
  });

  it('não aceita cartão de outro usuário', async () => {
    const otherCookie = await createVerifiedUser(app, 'outro@example.com');
    const foreign = (await createCard({}, otherCookie)).body.card.id;
    expect((await createEntry(purchase({ cardId: foreign }))).body.error.code).toBe('INVALID_CARD');
  });

  it('trocar de crédito para outra forma tira o cartão da despesa', async () => {
    const id = (await createCard()).body.card.id;
    const entry = (await createEntry(purchase({ cardId: id }))).body.entry;
    const edited = await request(app).put(`/api/entries/${entry.id}`).set('Cookie', cookie).send(purchase({ paymentMethodId: pix }));
    expect(edited.body.entry).toMatchObject({ paymentMethodId: pix, cardId: null });
  });

  it('repetir mantém o cartão (RN-25b)', async () => {
    const id = (await createCard()).body.card.id;
    const entry = (await createEntry(purchase({ cardId: id }))).body.entry;
    const copies = (await request(app).post(`/api/entries/${entry.id}/repeat`).set('Cookie', cookie).send({ times: 2 })).body.entries;
    expect(copies.every((c: { cardId: number }) => c.cardId === id)).toBe(true);
  });
});

describe('arquivar e excluir (RN-57)', () => {
  it('cartão sem compras pode ser excluído', async () => {
    const id = (await createCard()).body.card.id;
    expect((await deleteCard(id)).status).toBe(204);
    expect(await listCards()).toEqual([]);
  });

  it('cartão com compras não pode ser excluído, só arquivado', async () => {
    const id = (await createCard()).body.card.id;
    await createEntry(purchase({ cardId: id })).expect(201);
    const blocked = await deleteCard(id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CARD_HAS_ENTRIES');
    expect((await updateCard(id, { archived: true })).body.card.archived).toBe(true);
  });

  it('arquivado não aceita compras novas, mas a compra antiga mantém o cartão ao ser editada', async () => {
    const id = (await createCard()).body.card.id;
    const old = (await createEntry(purchase({ cardId: id }))).body.entry;
    await updateCard(id, { archived: true }).expect(200);

    expect((await createEntry(purchase({ cardId: id }))).body.error.code).toBe('CARD_ARCHIVED');
    const edited = await request(app).put(`/api/entries/${old.id}`).set('Cookie', cookie).send(purchase({ cardId: id, amountCents: 7000 }));
    expect(edited.status).toBe(200);
  });

  it('reativado, volta a aceitar compras; a lista mostra os ativos primeiro', async () => {
    const archived = (await createCard({ name: 'A antigo' })).body.card.id;
    await createCard({ name: 'B atual' }).expect(201);
    await updateCard(archived, { archived: true }).expect(200);
    expect((await listCards()).map((c) => c.name)).toEqual(['B atual', 'A antigo']);

    await updateCard(archived, { archived: false }).expect(200);
    expect((await createEntry(purchase({ cardId: archived }))).status).toBe(201);
  });
});

describe('painel: gastos por forma de pagamento (RN-71)', () => {
  it('soma as despesas do período por forma e, no crédito, por cartão', async () => {
    const main = (await createCard({ name: 'Principal' })).body.card.id;
    const store = (await createCard({ name: 'Loja', color: 'amber' })).body.card.id;
    await createEntry(purchase({ cardId: main, amountCents: 3000 })).expect(201);
    await createEntry(purchase({ cardId: store, amountCents: 1000 })).expect(201);
    await createEntry(purchase({ paymentMethodId: pix, amountCents: 2500 })).expect(201);
    await createEntry(purchase({ paymentMethodId: pix, amountCents: 999, date: '2026-10-10' })).expect(201); // outro período

    const { byPaymentMethod } = (await request(app).get('/api/dashboard').set('Cookie', cookie)).body;
    expect(byPaymentMethod).toEqual([
      {
        paymentMethodId: credit,
        kind: 'CREDIT',
        name: 'Crédito',
        totalCents: 4000,
        cards: [
          { cardId: main, name: 'Principal', color: 'purple', totalCents: 3000 },
          { cardId: store, name: 'Loja', color: 'amber', totalCents: 1000 },
        ],
      },
      { paymentMethodId: pix, kind: 'PIX', name: 'Pix', totalCents: 2500, cards: [] },
    ]);
  });
});
