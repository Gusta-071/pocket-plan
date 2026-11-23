import { prisma } from '../src/lib/prisma.js';

/** Apaga todos os dados entre os testes (filhos antes dos pais). */
export async function resetDatabase() {
  await prisma.authAttempt.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}
