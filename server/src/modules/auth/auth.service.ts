import type { z } from 'zod';
import type { PeriodNaming } from '../../../../shared/period.js';
import { generateToken, hashPassword, hashToken, spendPasswordCheckTime, verifyPassword } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { sendMail } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { categoryNameKey, DEFAULT_CATEGORIES } from '../categories/categories.constants.js';
import type {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas.js';

const MINUTE = 60 * 1000;
export const SESSION_DURATION_MS = 7 * 24 * 60 * MINUTE; // RN-08
const RESET_TOKEN_DURATION_MS = 30 * MINUTE; // RN-09b
const VERIFICATION_TOKEN_DURATION_MS = 24 * 60 * MINUTE; // RN-09f
const ATTEMPT_WINDOW_MS = 15 * MINUTE; // RN-08c, RN-09c e RN-09h
const MAX_LOGIN_FAILURES = 10; // RN-08c
const MAX_RESET_REQUESTS = 3; // RN-09c
const MAX_VERIFICATION_EMAILS = 3; // RN-09h

export const FORGOT_PASSWORD_MESSAGE = 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.';

type AttemptKind = 'LOGIN_FAILURE' | 'PASSWORD_RESET_REQUEST' | 'EMAIL_VERIFICATION_SENT';

export type Theme = 'LIGHT' | 'DARK' | 'SYSTEM';

export type PublicUser = {
  id: number;
  name: string;
  email: string;
  emailVerified: boolean;
  monthStartDay: number;
  periodNaming: PeriodNaming;
  theme: Theme;
};

type UserRow = {
  id: number;
  name: string;
  email: string;
  emailVerifiedAt: Date | null;
  monthStartDay: number;
  periodNaming: string;
  theme: string;
};

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    monthStartDay: user.monthStartDay,
    periodNaming: user.periodNaming as PeriodNaming,
    theme: user.theme as Theme,
  };
}

async function countRecentAttempts(kind: AttemptKind, email: string): Promise<number> {
  return prisma.authAttempt.count({
    where: { kind, email, createdAt: { gt: new Date(Date.now() - ATTEMPT_WINDOW_MS) } },
  });
}

async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

/** Gera um novo link de confirmação, invalida os anteriores e envia o e-mail (RN-09f, RN-09h). */
async function sendVerificationEmail(user: UserRow, appUrl: string): Promise<void> {
  const token = generateToken();
  const now = new Date();
  await prisma.$transaction([
    prisma.emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.emailVerificationToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_DURATION_MS),
      },
    }),
    prisma.authAttempt.create({ data: { kind: 'EMAIL_VERIFICATION_SENT', email: user.email } }),
  ]);

  const link = `${appUrl}/confirmar-email?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: user.email,
    subject: 'pocket-plan — confirme seu e-mail',
    text: `Olá, ${user.name}!\n\nBem-vindo ao pocket-plan. Para liberar sua conta, confirme seu e-mail acessando o link abaixo. Ele vale por 24 horas e só pode ser usado uma vez.\n\n${link}\n\nSe você não criou esta conta, ignore este e-mail.`,
  });
}

/** RN-05, RN-06, RN-07, RN-08b, RN-09, RN-09f. */
export async function register(input: z.infer<typeof registerSchema>, appUrl: string) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, 'EMAIL_IN_USE', 'Este e-mail já está em uso.');

  // RN-09: o dia de início (1) e o nome do período (automático) vêm dos padrões do banco,
  // e a conta nasce com as categorias padrão (RN-15), tudo na mesma operação.
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      categories: {
        create: DEFAULT_CATEGORIES.map((category) => ({ ...category, nameKey: categoryNameKey(category.name) })),
      },
    },
  });

  // Se o envio falhar, a conta continua criada: o usuário pode pedir o reenvio (RN-09h).
  await sendVerificationEmail(user, appUrl).catch((error: unknown) => {
    console.error('Falha ao enviar o e-mail de confirmação:', error);
  });

  return { user: toPublicUser(user), session: await createSession(user.id) };
}

/** RN-08, RN-08a, RN-08c. */
export async function login(input: z.infer<typeof loginSchema>) {
  if ((await countRecentAttempts('LOGIN_FAILURE', input.email)) >= MAX_LOGIN_FAILURES) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.');
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = user
    ? await verifyPassword(input.password, user.passwordHash)
    : await spendPasswordCheckTime(input.password).then(() => false);

  if (!user || !valid) {
    await prisma.authAttempt.create({ data: { kind: 'LOGIN_FAILURE', email: input.email } });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
  }
  return { user: toPublicUser(user), session: await createSession(user.id) };
}

export async function logout(sessionToken: string | undefined): Promise<void> {
  if (!sessionToken) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(sessionToken) } });
}

/** Devolve o usuário dono de uma sessão válida, ou null (RN-04, RN-08). */
export async function findUserBySession(sessionToken: string | undefined): Promise<PublicUser | null> {
  if (!sessionToken) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return toPublicUser(session.user);
}

/** RN-09f: confirma o e-mail pelo link, mesmo sem sessão. */
export async function verifyEmail(input: z.infer<typeof verifyEmailSchema>): Promise<void> {
  const now = new Date();
  const invalid = () =>
    new AppError(400, 'INVALID_VERIFICATION_TOKEN', 'Este link de confirmação é inválido ou expirou. Peça um novo.');

  const verification = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!verification || verification.usedAt || verification.expiresAt <= now) throw invalid();

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.emailVerificationToken.updateMany({
      where: { id: verification.id, usedAt: null },
      data: { usedAt: now },
    });
    if (count === 0) throw invalid();
    await tx.user.updateMany({ where: { id: verification.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
  });
}

/** RN-09h: reenvia o link de confirmação para o usuário logado. */
export async function resendVerification(userId: number, appUrl: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) throw new AppError(409, 'EMAIL_ALREADY_VERIFIED', 'Seu e-mail já está confirmado.');
  if ((await countRecentAttempts('EMAIL_VERIFICATION_SENT', user.email)) >= MAX_VERIFICATION_EMAILS) {
    throw new AppError(429, 'TOO_MANY_REQUESTS', 'Muitos envios em pouco tempo. Aguarde alguns minutos e tente novamente.');
  }
  await sendVerificationEmail(user, appUrl);
}

/** RN-09a, RN-09b, RN-09c, RN-09e. */
export async function requestPasswordReset(input: z.infer<typeof forgotPasswordSchema>, appUrl: string): Promise<void> {
  if ((await countRecentAttempts('PASSWORD_RESET_REQUEST', input.email)) >= MAX_RESET_REQUESTS) {
    throw new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas solicitações para este e-mail. Aguarde alguns minutos e tente novamente.');
  }
  await prisma.authAttempt.create({ data: { kind: 'PASSWORD_RESET_REQUEST', email: input.email } });

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) return;

  const token = generateToken();
  const now = new Date();
  await prisma.$transaction([
    // Uma nova solicitação invalida os códigos anteriores.
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordResetToken.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(now.getTime() + RESET_TOKEN_DURATION_MS) },
    }),
  ]);

  const link = `${appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: user.email,
    subject: 'pocket-plan — redefinição de senha',
    text: `Olá, ${user.name}!\n\nPara definir uma nova senha, acesse o link abaixo. Ele vale por 30 minutos e só pode ser usado uma vez.\n\n${link}\n\nSe você não pediu a redefinição, ignore este e-mail.`,
  });
}

/** RN-09b, RN-09d (nova senha diferente da atual), RN-09i. */
export async function resetPassword(input: z.infer<typeof resetPasswordSchema>): Promise<void> {
  const now = new Date();
  const invalid = () =>
    new AppError(400, 'INVALID_RESET_TOKEN', 'Este link de redefinição é inválido ou expirou. Solicite um novo.');

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) throw invalid();

  // RN-09d: a nova senha precisa ser diferente da atual. O código continua válido para outra tentativa.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: resetToken.userId } });
  if (await verifyPassword(input.password, user.passwordHash)) {
    const message = 'A nova senha deve ser diferente da senha atual.';
    throw new AppError(400, 'SAME_PASSWORD', message, [{ path: 'password', message }]);
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    // Marca como usado só se ainda não foi: duas requisições simultâneas não usam o mesmo código.
    const { count } = await tx.passwordResetToken.updateMany({
      where: { id: resetToken.id, usedAt: null },
      data: { usedAt: now },
    });
    if (count === 0) throw invalid();
    await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
    // RN-09i: quem recebeu o link no e-mail prova que tem acesso a ele.
    await tx.user.updateMany({ where: { id: resetToken.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
    await tx.session.deleteMany({ where: { userId: resetToken.userId } });
  });
}
