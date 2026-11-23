import type { z } from 'zod';
import { hashPassword, hashToken, verifyPassword } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { toPublicUser, type PublicUser } from '../auth/auth.service.js';
import type { changePasswordSchema, preferencesSchema, profileSchema } from './settings.schemas.js';

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_PASSWORD_FAILURES = 10;

/**
 * Confere a senha atual. Erros contam no mesmo limite do login (RN-08c),
 * para que uma sessão aberta não sirva para adivinhar a senha.
 */
async function checkCurrentPassword(userId: number, password: string, field: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const failures = await prisma.authAttempt.count({
    where: { kind: 'LOGIN_FAILURE', email: user.email, createdAt: { gt: new Date(Date.now() - ATTEMPT_WINDOW_MS) } },
  });
  if (failures >= MAX_PASSWORD_FAILURES) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas com senha errada. Aguarde alguns minutos e tente novamente.');
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await prisma.authAttempt.create({ data: { kind: 'LOGIN_FAILURE', email: user.email } });
    const message = 'Senha atual incorreta.';
    throw new AppError(400, 'WRONG_PASSWORD', message, [{ path: field, message }]);
  }
  return user;
}

/** RN-42 */
export async function updateProfile(userId: number, input: z.infer<typeof profileSchema>): Promise<PublicUser> {
  return toPublicUser(await prisma.user.update({ where: { id: userId }, data: { name: input.name } }));
}

/** RN-44, RN-45 */
export async function updatePreferences(userId: number, input: z.infer<typeof preferencesSchema>): Promise<PublicUser> {
  return toPublicUser(await prisma.user.update({ where: { id: userId }, data: input }));
}

/** RN-43: encerra as outras sessões e mantém a atual. */
export async function changePassword(
  userId: number,
  currentSessionToken: string | undefined,
  input: z.infer<typeof changePasswordSchema>,
): Promise<void> {
  const user = await checkCurrentPassword(userId, input.currentPassword, 'currentPassword');
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    const message = 'A nova senha deve ser diferente da senha atual.';
    throw new AppError(400, 'SAME_PASSWORD', message, [{ path: 'newPassword', message }]);
  }
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({
      where: { userId, ...(currentSessionToken && { tokenHash: { not: hashToken(currentSessionToken) } }) },
    }),
  ]);
}

/** RN-46 */
export async function logoutEverywhere(userId: number): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/** RN-47: apaga a conta; os dados ligados a ela saem em cascata. */
export async function deleteAccount(userId: number, password: string): Promise<void> {
  const user = await checkCurrentPassword(userId, password, 'password');
  await prisma.$transaction([
    prisma.authAttempt.deleteMany({ where: { email: user.email } }),
    // Lançamentos antes das categorias, que não podem sair enquanto tiverem lançamentos.
    prisma.entry.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}
