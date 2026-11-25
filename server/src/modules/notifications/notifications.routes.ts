import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth/auth.session.js';
import { dismiss, listNotifications, markRead, restore } from './notifications.service.js';

export const notificationRoutes = Router();

notificationRoutes.use(requireAuth);

const keySchema = z.string().min(1).max(100);

/** RN-72: avisos visíveis, não lidos e dispensados. */
notificationRoutes.get('/', async (_req, res) => {
  res.json(await listNotifications(currentUser(res).id));
});

/** RN-72a */
notificationRoutes.post('/:key/read', async (req, res) => {
  await markRead(currentUser(res).id, keySchema.parse(req.params.key));
  res.status(204).end();
});

/** RN-72b */
notificationRoutes.post('/:key/dismiss', async (req, res) => {
  res.json(await dismiss(currentUser(res).id, keySchema.parse(req.params.key)));
});

/** RN-72b */
notificationRoutes.post('/:key/restore', async (req, res) => {
  await restore(currentUser(res).id, keySchema.parse(req.params.key));
  res.status(204).end();
});
