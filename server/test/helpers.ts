import type { Express } from 'express';
import request from 'supertest';
import { prisma } from '../src/lib/prisma.js';

/** Apaga todos os dados entre os testes (filhos antes dos pais). */
export async function resetDatabase() {
  await prisma.authAttempt.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.entry.deleteMany();
  await prisma.card.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.category.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

/** Cookie de sessão devolvido por uma resposta de cadastro ou login. */
export function sessionCookieOf(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = cookies?.find((c) => c.startsWith('pp_session='));
  if (!cookie) throw new Error('Resposta sem cookie de sessão');
  return cookie.split(';')[0]!;
}

/** Cria uma conta já com e-mail confirmado e devolve o cookie da sessão. */
export async function createVerifiedUser(app: Express, email = 'ana@example.com'): Promise<string> {
  const response = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ana Souza', email, password: 'senha1234' })
    .expect(201);
  await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  return sessionCookieOf(response);
}

/** Id de uma forma de pagamento da conta (RN-67, RN-68), pelo tipo. Despesas exigem uma. */
export async function paymentMethodIdOf(app: Express, cookie: string, kind = 'PIX'): Promise<number> {
  const response = await request(app).get('/api/payment-methods').set('Cookie', cookie).expect(200);
  return (response.body.paymentMethods as { id: number; kind: string }[]).find((m) => m.kind === kind)!.id;
}
