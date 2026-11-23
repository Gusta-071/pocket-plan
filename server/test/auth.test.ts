import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/lib/crypto.js';
import { sendMail } from '../src/lib/mailer.js';
import { prisma } from '../src/lib/prisma.js';
import { resetDatabase } from './helpers.js';

vi.mock('../src/lib/mailer.js', () => ({ sendMail: vi.fn() }));

const app = createApp();
const valid = { name: 'Ana Souza', email: 'ana@example.com', password: 'senha1234' };

async function register(body: Partial<typeof valid> = {}) {
  return request(app).post('/api/auth/register').send({ ...valid, ...body });
}

function sessionCookie(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('pp_session='));
  if (!cookie) throw new Error('Resposta sem cookie de sessão');
  return cookie.split(';')[0]!;
}

/** Pede a redefinição e devolve o código que foi no e-mail. */
async function requestResetToken(email = valid.email): Promise<string> {
  vi.mocked(sendMail).mockClear();
  await request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
  const text = vi.mocked(sendMail).mock.calls[0]?.[0].text ?? '';
  const token = /token=([^\s]+)/.exec(text)?.[1];
  if (!token) throw new Error('E-mail sem link de redefinição');
  return decodeURIComponent(token);
}

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(sendMail).mockClear();
});

describe('cadastro', () => {
  it('cria a conta e já entra logado (RN-05, RN-08b)', async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ name: 'Ana Souza', email: 'ana@example.com' });
    const me = await request(app).get('/api/auth/me').set('Cookie', sessionCookie(response));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ana@example.com');
  });

  it('usa os padrões do mês financeiro (RN-09)', async () => {
    await register();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: valid.email } });
    expect(user.monthStartDay).toBe(1);
    expect(user.periodNaming).toBe('AUTO');
  });

  it('valida o tamanho do nome (RN-05)', async () => {
    expect((await register({ name: 'A' })).status).toBe(400);
    expect((await register({ name: 'A'.repeat(81) })).status).toBe(400);
    expect((await register({ name: '  Al  ' })).status).toBe(201);
  });

  it('normaliza o e-mail e não permite repetir (RN-06)', async () => {
    const first = await register({ email: '  Ana@Example.COM ' });
    expect(first.body.user.email).toBe('ana@example.com');

    const second = await register({ email: 'ANA@example.com' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('EMAIL_IN_USE');
  });

  it.each([
    ['curta', 'abc1234'],
    ['sem número', 'somenteletras'],
    ['sem letra', '1234567890'],
  ])('recusa senha %s (RN-07)', async (_caso, password) => {
    const response = await register({ password });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('guarda só o hash da senha (RN-07)', async () => {
    await register();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: valid.email } });
    expect(user.passwordHash).not.toContain(valid.password);
    expect(user.passwordHash.startsWith('scrypt$')).toBe(true);
  });
});

describe('login e sessão', () => {
  beforeEach(async () => {
    await register();
  });

  it('entra com e-mail e senha, aceitando o e-mail com outra grafia (RN-06, RN-08)', async () => {
    const response = await request(app).post('/api/auth/login').send({ email: ' ANA@example.com', password: valid.password });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('ana@example.com');
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toMatch(/Max-Age=604800/); // 7 dias
  });

  it('responde igual para senha errada e e-mail inexistente (RN-08a)', async () => {
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: valid.email, password: 'errada123' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'nao@existe.com', password: 'errada123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.message).toBe('E-mail ou senha inválidos.');
  });

  it('exige sessão válida (RN-08)', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');

    const forged = await request(app).get('/api/auth/me').set('Cookie', 'pp_session=inventado');
    expect(forged.status).toBe(401);
  });

  it('recusa sessão expirada (RN-08)', async () => {
    const login = await request(app).post('/api/auth/login').send(valid);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await request(app).get('/api/auth/me').set('Cookie', sessionCookie(login));
    expect(response.status).toBe(401);
  });

  it('sair encerra a sessão (RN-08)', async () => {
    const login = await request(app).post('/api/auth/login').send(valid);
    const cookie = sessionCookie(login);

    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);

    const response = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(response.status).toBe(401);
  });
});

describe('limite de tentativas de login (RN-08c)', () => {
  const wrong = { email: valid.email, password: 'errada123' };

  beforeEach(async () => {
    await register();
  });

  it('bloqueia após 10 erros, mesmo com a senha certa', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post('/api/auth/login').send(wrong)).status).toBe(401);
    }

    const blocked = await request(app).post('/api/auth/login').send(valid);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('libera quando os erros saem da janela de 15 minutos', async () => {
    for (let i = 0; i < 10; i++) await request(app).post('/api/auth/login').send(wrong);
    await prisma.authAttempt.updateMany({ data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });

    expect((await request(app).post('/api/auth/login').send(valid)).status).toBe(200);
  });

  it('vale também para e-mail não cadastrado', async () => {
    const unknown = { email: 'nao@existe.com', password: 'errada123' };
    for (let i = 0; i < 10; i++) await request(app).post('/api/auth/login').send(unknown);

    expect((await request(app).post('/api/auth/login').send(unknown)).status).toBe(429);
  });

  it('não afeta outros e-mails', async () => {
    for (let i = 0; i < 10; i++) await request(app).post('/api/auth/login').send({ ...wrong, email: 'outro@example.com' });

    expect((await request(app).post('/api/auth/login').send(valid)).status).toBe(200);
  });
});

describe('recuperação de senha', () => {
  beforeEach(async () => {
    await register();
  });

  it('responde a mesma mensagem exista ou não a conta (RN-09a)', async () => {
    vi.mocked(sendMail).mockClear(); // ignora o e-mail de confirmação do cadastro
    const existing = await request(app).post('/api/auth/forgot-password').send({ email: valid.email });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'nao@existe.com' });

    expect(existing.status).toBe(200);
    expect(existing.body).toEqual(unknown.body);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMail).mock.calls[0]?.[0].to).toBe(valid.email);
  });

  it('guarda só o hash do código, válido por 30 minutos (RN-09b)', async () => {
    const token = await requestResetToken();
    const stored = await prisma.passwordResetToken.findFirstOrThrow();

    expect(stored.tokenHash).toBe(hashToken(token));
    const minutes = (stored.expiresAt.getTime() - stored.createdAt.getTime()) / 60000;
    expect(minutes).toBeCloseTo(30, 0);
  });

  it('redefine a senha e encerra todas as sessões (RN-09d)', async () => {
    const session = sessionCookie(await request(app).post('/api/auth/login').send(valid));
    const token = await requestResetToken();

    await request(app).post('/api/auth/reset-password').send({ token, password: 'novaSenha9' }).expect(204);

    expect((await request(app).get('/api/auth/me').set('Cookie', session)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send(valid)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ ...valid, password: 'novaSenha9' })).status).toBe(200);
  });

  it('o código só pode ser usado uma vez (RN-09b)', async () => {
    const token = await requestResetToken();
    await request(app).post('/api/auth/reset-password').send({ token, password: 'novaSenha9' }).expect(204);

    const again = await request(app).post('/api/auth/reset-password').send({ token, password: 'outraSenha9' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('o código expira após 30 minutos (RN-09b)', async () => {
    const token = await requestResetToken();
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await request(app).post('/api/auth/reset-password').send({ token, password: 'novaSenha9' });
    expect(response.status).toBe(400);
  });

  it('uma nova solicitação invalida o código anterior (RN-09b)', async () => {
    const first = await requestResetToken();
    const second = await requestResetToken();

    expect((await request(app).post('/api/auth/reset-password').send({ token: first, password: 'novaSenha9' })).status).toBe(400);
    expect((await request(app).post('/api/auth/reset-password').send({ token: second, password: 'novaSenha9' })).status).toBe(204);
  });

  it('a nova senha deve ser diferente da atual, sem gastar o código (RN-09d)', async () => {
    const token = await requestResetToken();

    const same = await request(app).post('/api/auth/reset-password').send({ token, password: valid.password });
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('SAME_PASSWORD');
    expect(same.body.error.fields[0].path).toBe('password');

    await request(app).post('/api/auth/reset-password').send({ token, password: 'novaSenha9' }).expect(204);
  });

  it('a nova senha segue RN-07 (RN-09d)', async () => {
    const token = await requestResetToken();
    const response = await request(app).post('/api/auth/reset-password').send({ token, password: 'curta1' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('permite no máximo 3 solicitações por e-mail em 15 minutos (RN-09c)', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/auth/forgot-password').send({ email: valid.email }).expect(200);
    }
    const blocked = await request(app).post('/api/auth/forgot-password').send({ email: valid.email });
    expect(blocked.status).toBe(429);

    await prisma.authAttempt.updateMany({ data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });
    await request(app).post('/api/auth/forgot-password').send({ email: valid.email }).expect(200);
  });
});

describe('confirmação de e-mail', () => {
  /** Último link de confirmação enviado por e-mail. */
  function lastVerificationToken(): string {
    const mail = vi.mocked(sendMail).mock.calls.map((call) => call[0]).filter((m) => m.subject.includes('confirme')).at(-1);
    const token = /confirmar-email\?token=([^\s]+)/.exec(mail?.text ?? '')?.[1];
    if (!token) throw new Error('Nenhum e-mail de confirmação enviado');
    return decodeURIComponent(token);
  }

  it('o cadastro envia o link e a conta começa não confirmada (RN-09f)', async () => {
    const response = await register();

    expect(response.body.user.emailVerified).toBe(false);
    expect(vi.mocked(sendMail).mock.calls[0]?.[0].to).toBe(valid.email);
    const stored = await prisma.emailVerificationToken.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashToken(lastVerificationToken()));
    const hours = (stored.expiresAt.getTime() - stored.createdAt.getTime()) / 3600000;
    expect(hours).toBeCloseTo(24, 1);
  });

  it('o link confirma o e-mail, mesmo sem estar logado (RN-09f)', async () => {
    const cookie = sessionCookie(await register());

    await request(app).post('/api/auth/verify-email').send({ token: lastVerificationToken() }).expect(204);

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.body.user.emailVerified).toBe(true);
  });

  it('o link só pode ser usado uma vez e expira (RN-09f)', async () => {
    await register();
    const token = lastVerificationToken();
    await request(app).post('/api/auth/verify-email').send({ token }).expect(204);
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400);

    await prisma.user.updateMany({ data: { emailVerifiedAt: null } });
    await request(app).post('/api/auth/resend-verification').set('Cookie', sessionCookie(await request(app).post('/api/auth/login').send(valid))).expect(204);
    await prisma.emailVerificationToken.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).post('/api/auth/verify-email').send({ token: lastVerificationToken() });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
  });

  it('sem confirmar, a conta acessa só as rotas da própria conta (RN-09g)', async () => {
    const cookie = sessionCookie(await register());
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);

    // Rota de teste protegida como as futuras funcionalidades.
    const { requireAuth } = await import('../src/modules/auth/auth.session.js');
    const express = (await import('express')).default;
    const guarded = express();
    guarded.get('/privado', requireAuth, (_req, res) => {
      res.json({ ok: true });
    });
    guarded.use((await import('../src/lib/errors.js')).errorHandler);

    const blocked = await request(guarded).get('/privado').set('Cookie', cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    await request(app).post('/api/auth/verify-email').send({ token: lastVerificationToken() }).expect(204);
    expect((await request(guarded).get('/privado').set('Cookie', cookie)).status).toBe(200);
  });

  it('reenvio: novo link invalida o anterior; máximo 3 envios em 15 minutos (RN-09h)', async () => {
    const cookie = sessionCookie(await register()); // 1º envio
    const first = lastVerificationToken();

    await request(app).post('/api/auth/resend-verification').set('Cookie', cookie).expect(204); // 2º
    const second = lastVerificationToken();
    await request(app).post('/api/auth/resend-verification').set('Cookie', cookie).expect(204); // 3º
    const third = lastVerificationToken();

    const blocked = await request(app).post('/api/auth/resend-verification').set('Cookie', cookie);
    expect(blocked.status).toBe(429);

    expect((await request(app).post('/api/auth/verify-email').send({ token: first })).status).toBe(400);
    expect((await request(app).post('/api/auth/verify-email').send({ token: second })).status).toBe(400);
    await request(app).post('/api/auth/verify-email').send({ token: third }).expect(204);
  });

  it('não reenvia para conta já confirmada nem sem sessão', async () => {
    const cookie = sessionCookie(await register());
    await request(app).post('/api/auth/verify-email').send({ token: lastVerificationToken() }).expect(204);

    expect((await request(app).post('/api/auth/resend-verification').set('Cookie', cookie)).status).toBe(409);
    expect((await request(app).post('/api/auth/resend-verification')).status).toBe(401);
  });

  it('redefinir a senha pelo e-mail também confirma o e-mail (RN-09i)', async () => {
    await register();
    const token = await requestResetToken();
    await request(app).post('/api/auth/reset-password').send({ token, password: 'novaSenha9' }).expect(204);

    const login = await request(app).post('/api/auth/login').send({ ...valid, password: 'novaSenha9' });
    expect(login.body.user.emailVerified).toBe(true);
  });
});
