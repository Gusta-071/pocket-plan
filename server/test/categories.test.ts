import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createVerifiedUser, resetDatabase, sessionCookieOf } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const app = createApp();
let cookie: string;

type Category = { id: number; type: 'INCOME' | 'EXPENSE'; name: string; color: string; expenseClass: string | null };

async function list(sessionCookie = cookie): Promise<Category[]> {
  const response = await request(app).get('/api/categories').set('Cookie', sessionCookie).expect(200);
  return response.body.categories;
}

function create(body: object, sessionCookie = cookie) {
  return request(app).post('/api/categories').set('Cookie', sessionCookie).send(body);
}

function update(id: number, body: object, sessionCookie = cookie) {
  return request(app).patch(`/api/categories/${id}`).set('Cookie', sessionCookie).send(body);
}

function remove(id: number, query = '', sessionCookie = cookie) {
  return request(app).delete(`/api/categories/${id}${query}`).set('Cookie', sessionCookie);
}

async function byName(name: string): Promise<Category> {
  const category = (await list()).find((c) => c.name === name);
  if (!category) throw new Error(`Categoria ${name} não encontrada`);
  return category;
}

beforeEach(async () => {
  await resetDatabase();
  cookie = await createVerifiedUser(app);
});

describe('categorias padrão (RN-15)', () => {
  it('a conta nova recebe 4 de receita e 12 de despesa, com cor', async () => {
    const categories = await list();

    expect(categories.filter((c) => c.type === 'INCOME').map((c) => c.name)).toEqual([
      'Freelance',
      'Outras receitas',
      'Renda extra',
      'Salário',
    ]);
    expect(categories.filter((c) => c.type === 'EXPENSE')).toHaveLength(12);
    expect(categories.every((c) => c.color)).toBe(true);
  });

  it('as de despesa vêm com a classe sugerida; as de receita, sem classe (RN-14a)', async () => {
    const categories = await list();
    const namesOf = (expenseClass: string) =>
      categories.filter((c) => c.expenseClass === expenseClass).map((c) => c.name);

    expect(namesOf('FIXED')).toEqual(['Assinaturas', 'Contas e serviços', 'Educação', 'Moradia', 'Saúde']);
    expect(namesOf('VARIABLE')).toEqual(['Alimentação', 'Compras', 'Lazer', 'Outras despesas', 'Transporte']);
    expect(namesOf('INVESTMENT')).toEqual(['Investimentos', 'Reserva de emergência']);
    expect(categories.filter((c) => c.type === 'INCOME').every((c) => c.expenseClass === null)).toBe(true);
  });

  it('lista em ordem alfabética, ignorando acentos', async () => {
    const names = (await list()).filter((c) => c.type === 'EXPENSE').map((c) => c.name);
    expect(names.slice(0, 3)).toEqual(['Alimentação', 'Assinaturas', 'Compras']);
  });
});

describe('acesso', () => {
  it('exige login e e-mail confirmado (RN-08, RN-09g)', async () => {
    expect((await request(app).get('/api/categories')).status).toBe(401);

    const unverified = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bia', email: 'bia@example.com', password: 'senha1234' });
    const blocked = await request(app).get('/api/categories').set('Cookie', sessionCookieOf(unverified));
    expect(blocked.status).toBe(403);
  });

  it('cada usuário vê e altera só as próprias categorias (RN-04)', async () => {
    const other = await createVerifiedUser(app, 'outro@example.com');
    const mine = await byName('Lazer');

    expect((await list(other)).some((c) => c.id === mine.id)).toBe(false);
    expect((await update(mine.id, { name: 'Invadido' }, other)).status).toBe(404);
    expect((await remove(mine.id, '', other)).status).toBe(404);
    expect((await byName('Lazer')).id).toBe(mine.id);
  });
});

describe('criação (RN-14, RN-16, RN-16a, RN-16b)', () => {
  it('cria categoria de receita ou despesa, sem espaços nas pontas', async () => {
    const response = await create({ type: 'EXPENSE', name: '  Pets  ', color: 'lime', expenseClass: 'VARIABLE' });

    expect(response.status).toBe(201);
    expect(response.body.category).toMatchObject({ type: 'EXPENSE', name: 'Pets', color: 'lime' });
  });

  it('valida nome de 1 a 40 caracteres e tipo', async () => {
    expect((await create({ type: 'EXPENSE', name: '   ', color: 'lime', expenseClass: 'VARIABLE' })).status).toBe(400);
    expect((await create({ type: 'EXPENSE', name: 'x'.repeat(41), color: 'lime', expenseClass: 'VARIABLE' })).status).toBe(400);
    expect((await create({ type: 'EXPENSE', name: 'x'.repeat(40), color: 'lime', expenseClass: 'VARIABLE' })).status).toBe(201);
    expect((await create({ type: 'OUTRO', name: 'Pets', color: 'lime' })).status).toBe(400);
  });

  it('só aceita cores da paleta (RN-16a)', async () => {
    expect((await create({ type: 'EXPENSE', name: 'Pets', color: '#ff0000', expenseClass: 'VARIABLE' })).status).toBe(400);
  });

  it('nome único por tipo, sem diferenciar maiúsculas e espaços (RN-16)', async () => {
    const duplicate = await create({ type: 'EXPENSE', name: ' LAZER ', color: 'lime', expenseClass: 'VARIABLE' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.fields[0].path).toBe('name');

    // O mesmo nome em outro tipo é permitido.
    expect((await create({ type: 'INCOME', name: 'Lazer', color: 'lime' })).status).toBe(201);
  });

  it('o mesmo nome pode existir em contas diferentes', async () => {
    const other = await createVerifiedUser(app, 'outro@example.com');
    expect((await create({ type: 'EXPENSE', name: 'Pets', color: 'lime', expenseClass: 'VARIABLE' })).status).toBe(201);
    expect((await create({ type: 'EXPENSE', name: 'Pets', color: 'lime', expenseClass: 'VARIABLE' }, other)).status).toBe(201);
  });

  it('no máximo 30 categorias de cada tipo (RN-16b)', async () => {
    // A conta nova já tem 12 categorias de despesa.
    for (let i = 0; i < 18; i++) {
      expect((await create({ type: 'EXPENSE', name: `Extra ${i}`, color: 'lime', expenseClass: 'VARIABLE' })).status).toBe(201);
    }

    const blocked = await create({ type: 'EXPENSE', name: 'Uma a mais', color: 'lime', expenseClass: 'VARIABLE' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CATEGORY_LIMIT_REACHED');
    expect((await create({ type: 'INCOME', name: 'Ainda cabe', color: 'lime' })).status).toBe(201);
  });
});

describe('classe da despesa (RN-14a)', () => {
  it('é obrigatória ao criar uma categoria de despesa', async () => {
    const missing = await create({ type: 'EXPENSE', name: 'Pets', color: 'lime' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields).toContainEqual({
      path: 'expenseClass',
      message: 'Escolha a classe: fixa, variável ou investimento.',
    });
    expect((await create({ type: 'EXPENSE', name: 'Pets', color: 'lime', expenseClass: 'OUTRA' })).status).toBe(400);
  });

  it('aceita as três classes', async () => {
    for (const [name, expenseClass] of [['Aluguel da garagem', 'FIXED'], ['Pets', 'VARIABLE'], ['Tesouro Direto', 'INVESTMENT']]) {
      const response = await create({ type: 'EXPENSE', name, color: 'lime', expenseClass });
      expect(response.status).toBe(201);
      expect(response.body.category.expenseClass).toBe(expenseClass);
    }
  });

  it('categorias de receita não têm classe', async () => {
    expect((await create({ type: 'INCOME', name: 'Bolsa', color: 'lime', expenseClass: 'FIXED' })).status).toBe(400);
    const created = await create({ type: 'INCOME', name: 'Bolsa', color: 'lime' });
    expect(created.status).toBe(201);
    expect(created.body.category.expenseClass).toBeNull();
  });

  it('pode ser trocada depois, inclusive nas padrão (RN-17)', async () => {
    const leisure = await byName('Lazer');
    const response = await update(leisure.id, { expenseClass: 'FIXED' });
    expect(response.status).toBe(200);
    expect(response.body.category).toMatchObject({ name: 'Lazer', expenseClass: 'FIXED' });
    expect((await update(leisure.id, { expenseClass: 'NENHUMA' })).status).toBe(400);
  });

  it('não pode ser dada a uma categoria de receita', async () => {
    const salary = await byName('Salário');
    const response = await update(salary.id, { expenseClass: 'FIXED' });
    expect(response.status).toBe(400);
    expect((await byName('Salário')).expenseClass).toBeNull();
  });
});

describe('edição (RN-17)', () => {
  it('renomeia e troca a cor, inclusive das padrão', async () => {
    const salary = await byName('Salário');
    const response = await update(salary.id, { name: 'Salário CLT', color: 'blue' });

    expect(response.status).toBe(200);
    expect(response.body.category).toMatchObject({ name: 'Salário CLT', color: 'blue', type: 'INCOME' });
  });

  it('não permite alterar o tipo', async () => {
    const salary = await byName('Salário');
    expect((await update(salary.id, { type: 'EXPENSE' })).status).toBe(400);
    expect((await byName('Salário')).type).toBe('INCOME');
  });

  it('não permite renomear para um nome já usado no mesmo tipo', async () => {
    const leisure = await byName('Lazer');
    expect((await update(leisure.id, { name: 'compras' })).status).toBe(409);
  });

  it('pode mudar só as maiúsculas do próprio nome', async () => {
    const leisure = await byName('Lazer');
    expect((await update(leisure.id, { name: 'LAZER' })).status).toBe(200);
  });
});

describe('exclusão (RN-18, RN-18a)', () => {
  it('exclui categoria sem lançamentos', async () => {
    const leisure = await byName('Lazer');
    expect((await remove(leisure.id)).status).toBe(204);
    expect((await list()).some((c) => c.id === leisure.id)).toBe(false);
  });

  it('o destino dos lançamentos deve ser outra categoria do mesmo tipo', async () => {
    const leisure = await byName('Lazer');
    const salary = await byName('Salário');

    expect((await remove(leisure.id, `?moveTo=${leisure.id}`)).status).toBe(400);
    const otherType = await remove(leisure.id, `?moveTo=${salary.id}`);
    expect(otherType.status).toBe(400);
    expect(otherType.body.error.code).toBe('INVALID_MOVE_TARGET');
  });

  it('mantém pelo menos uma categoria de cada tipo (RN-18a)', async () => {
    const income = (await list()).filter((c) => c.type === 'INCOME');
    for (const category of income.slice(1)) expect((await remove(category.id)).status).toBe(204);

    const last = await remove(income[0]!.id);
    expect(last.status).toBe(409);
    expect(last.body.error.code).toBe('LAST_CATEGORY_OF_TYPE');
    expect(await prisma.category.count({ where: { type: 'INCOME' } })).toBe(1);
  });
});
