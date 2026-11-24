import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { createVerifiedUser, resetDatabase, sessionCookieOf } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const app = createApp();
const credentials = { email: 'ana@example.com', password: 'senha1234' };
let cookie: string;

const me = (sessionCookie = cookie) => request(app).get('/api/auth/me').set('Cookie', sessionCookie);
const login = async () => sessionCookieOf(await request(app).post('/api/auth/login').send(credentials).expect(200));

beforeEach(async () => {
  await resetDatabase();
  cookie = await createVerifiedUser(app);
});

describe('perfil (RN-42)', () => {
  it('altera o nome, com as regras do cadastro', async () => {
    const response = await request(app).patch('/api/settings/profile').set('Cookie', cookie).send({ name: '  Ana Lima ' });
    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe('Ana Lima');

    expect((await request(app).patch('/api/settings/profile').set('Cookie', cookie).send({ name: 'A' })).status).toBe(400);
  });

  it('não altera o e-mail', async () => {
    await request(app).patch('/api/settings/profile').set('Cookie', cookie).send({ name: 'Ana', email: 'x@y.com' });
    expect((await me()).body.user.email).toBe('ana@example.com');
  });
});

describe('preferências (RN-44, RN-45)', () => {
  it('começa com dia 1, nome automático e tema automático', async () => {
    expect((await me()).body.user).toMatchObject({ monthStartDay: 1, periodNaming: 'AUTO', theme: 'SYSTEM' });
  });

  it('altera dia de início, nome do período e tema', async () => {
    const response = await request(app)
      .patch('/api/settings/preferences')
      .set('Cookie', cookie)
      .send({ monthStartDay: 5, periodNaming: 'END_MONTH', theme: 'DARK' });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ monthStartDay: 5, periodNaming: 'END_MONTH', theme: 'DARK' });
  });

  it.each([0, 29, 31, 2.5])('recusa dia de início %s (RN-10)', async (monthStartDay) => {
    const response = await request(app).patch('/api/settings/preferences').set('Cookie', cookie).send({ monthStartDay });
    expect(response.status).toBe(400);
  });

  it('saldo inicial começa em zero e aceita valores negativos (RN-44a)', async () => {
    const patch = (initialBalanceCents: unknown) =>
      request(app).patch('/api/settings/preferences').set('Cookie', cookie).send({ initialBalanceCents });

    expect((await me()).body.user.initialBalanceCents).toBe(0);
    expect((await patch(-150000)).body.user.initialBalanceCents).toBe(-150000);
    expect((await patch(1_000_000_000)).status).toBe(200);
    expect((await patch(1_000_000_001)).status).toBe(400);
    expect((await patch(-1_000_000_001)).status).toBe(400);
    expect((await patch(10.5)).status).toBe(400);
  });

  it('recusa opções desconhecidas', async () => {
    const patch = (body: object) => request(app).patch('/api/settings/preferences').set('Cookie', cookie).send(body);
    expect((await patch({ theme: 'BLUE' })).status).toBe(400);
    expect((await patch({ periodNaming: 'X' })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });
});

describe('alteração de senha (RN-43)', () => {
  const change = (body: object, sessionCookie = cookie) =>
    request(app).post('/api/settings/password').set('Cookie', sessionCookie).send(body);

  it('troca a senha, mantém esta sessão e encerra as outras', async () => {
    const otherDevice = await login();

    await change({ currentPassword: 'senha1234', newPassword: 'novaSenha9' }).expect(204);

    expect((await me()).status).toBe(200);
    expect((await me(otherDevice)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ ...credentials, password: 'novaSenha9' })).status).toBe(200);
  });

  it('exige a senha atual correta', async () => {
    const response = await change({ currentPassword: 'errada123', newPassword: 'novaSenha9' });
    expect(response.status).toBe(400);
    expect(response.body.error.fields[0].path).toBe('currentPassword');
  });

  it('a nova senha segue RN-07 e é diferente da atual', async () => {
    expect((await change({ currentPassword: 'senha1234', newPassword: 'curta1' })).status).toBe(400);
    const same = await change({ currentPassword: 'senha1234', newPassword: 'senha1234' });
    expect(same.status).toBe(400);
    expect(same.body.error.fields[0].path).toBe('newPassword');
  });

  it('erros de senha atual contam no limite de tentativas (RN-08c)', async () => {
    for (let i = 0; i < 10; i++) await change({ currentPassword: 'errada123', newPassword: 'novaSenha9' });
    expect((await change({ currentPassword: 'senha1234', newPassword: 'novaSenha9' })).status).toBe(429);
  });
});

describe('segurança e conta (RN-46, RN-47)', () => {
  it('sair de todos os aparelhos encerra todas as sessões', async () => {
    const otherDevice = await login();

    await request(app).post('/api/settings/logout-all').set('Cookie', cookie).expect(204);

    expect((await me()).status).toBe(401);
    expect((await me(otherDevice)).status).toBe(401);
  });

  it('excluir a conta exige a senha e apaga todos os dados', async () => {
    const wrong = await request(app).post('/api/settings/delete-account').set('Cookie', cookie).send({ password: 'errada123' });
    expect(wrong.status).toBe(400);
    expect(await prisma.user.count()).toBe(1);

    await request(app).post('/api/settings/delete-account').set('Cookie', cookie).send({ password: 'senha1234' }).expect(204);

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.category.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect((await me()).status).toBe(401);
    // O e-mail fica livre para um novo cadastro.
    expect((await request(app).post('/api/auth/register').send({ name: 'Ana', ...credentials })).status).toBe(201);
  });
});
