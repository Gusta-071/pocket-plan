import { Router } from 'express';
import { clearSessionCookie, currentUser, readSessionToken, requireAuth } from '../auth/auth.session.js';
import { changePasswordSchema, deleteAccountSchema, preferencesSchema, profileSchema } from './settings.schemas.js';
import * as settings from './settings.service.js';

export const settingsRoutes = Router();

settingsRoutes.use(requireAuth);

settingsRoutes.patch('/profile', async (req, res) => {
  res.json({ user: await settings.updateProfile(currentUser(res).id, profileSchema.parse(req.body)) });
});

settingsRoutes.patch('/preferences', async (req, res) => {
  res.json({ user: await settings.updatePreferences(currentUser(res).id, preferencesSchema.parse(req.body)) });
});

settingsRoutes.post('/password', async (req, res) => {
  await settings.changePassword(currentUser(res).id, readSessionToken(req), changePasswordSchema.parse(req.body));
  res.status(204).end();
});

settingsRoutes.post('/logout-all', async (_req, res) => {
  await settings.logoutEverywhere(currentUser(res).id);
  clearSessionCookie(res);
  res.status(204).end();
});

settingsRoutes.post('/delete-account', async (req, res) => {
  await settings.deleteAccount(currentUser(res).id, deleteAccountSchema.parse(req.body).password);
  clearSessionCookie(res);
  res.status(204).end();
});
