import type { Request, RequestHandler, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import { findUserBySession, SESSION_DURATION_MS, type PublicUser } from './auth.service.js';

export const SESSION_COOKIE = 'pp_session';

export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_DURATION_MS });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

/**
 * Exige sessão válida (RN-08), mesmo com o e-mail ainda não confirmado.
 * Usado só pelas rotas da própria conta (ver usuário, reenviar confirmação).
 * O usuário vem da sessão, nunca de um id enviado pelo cliente (RN-04).
 */
export const requireSession: RequestHandler = async (req, res, next) => {
  const user = await findUserBySession(readSessionToken(req));
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
  res.locals.user = user;
  next();
};

/**
 * Exige sessão válida e e-mail confirmado (RN-08, RN-09g).
 * É o padrão para todas as funcionalidades do app.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const user = await findUserBySession(readSessionToken(req));
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
  if (!user.emailVerified) throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Confirme seu e-mail para continuar.');
  res.locals.user = user;
  next();
};

export function currentUser(res: Response): PublicUser {
  const user = res.locals.user as PublicUser | undefined;
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
  return user;
}
