import { Router } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas.js';
import * as auth from './auth.service.js';
import { clearSessionCookie, currentUser, readSessionToken, requireSession, setSessionCookie } from './auth.session.js';

export const authRoutes = Router();

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

authRoutes.post('/register', async (req, res) => {
  const { user, session } = await auth.register(registerSchema.parse(req.body), appUrl());
  setSessionCookie(res, session.token); // RN-08b: já entra logado
  res.status(201).json({ user });
});

authRoutes.post('/login', async (req, res) => {
  const { user, session } = await auth.login(loginSchema.parse(req.body));
  setSessionCookie(res, session.token);
  res.json({ user });
});

authRoutes.post('/logout', async (req, res) => {
  await auth.logout(readSessionToken(req));
  clearSessionCookie(res);
  res.status(204).end();
});

// Responde mesmo com o e-mail não confirmado: a interface usa `emailVerified` para decidir a tela (RN-09g).
authRoutes.get('/me', requireSession, (_req, res) => {
  res.json({ user: currentUser(res) });
});

authRoutes.post('/verify-email', async (req, res) => {
  await auth.verifyEmail(verifyEmailSchema.parse(req.body));
  res.status(204).end();
});

authRoutes.post('/resend-verification', requireSession, async (_req, res) => {
  await auth.resendVerification(currentUser(res).id, appUrl());
  res.status(204).end();
});

authRoutes.post('/forgot-password', async (req, res) => {
  await auth.requestPasswordReset(forgotPasswordSchema.parse(req.body), appUrl());
  res.json({ message: auth.FORGOT_PASSWORD_MESSAGE });
});

authRoutes.post('/reset-password', async (req, res) => {
  await auth.resetPassword(resetPasswordSchema.parse(req.body));
  clearSessionCookie(res); // RN-09d: precisa entrar de novo
  res.status(204).end();
});
