import { Router } from 'express';
import { currentUser, requireAuth } from '../auth/auth.session.js';
import { entryIdSchema, entrySchema, listEntriesQuerySchema, paidSchema, repeatSchema, updateEntrySchema } from './entries.schemas.js';
import * as entries from './entries.service.js';

export const entryRoutes = Router();

entryRoutes.use(requireAuth);

entryRoutes.get('/', async (req, res) => {
  res.json(await entries.listEntries(currentUser(res).id, listEntriesQuerySchema.parse(req.query)));
});

entryRoutes.post('/', async (req, res) => {
  res.status(201).json(await entries.createEntry(currentUser(res).id, entrySchema.parse(req.body)));
});

entryRoutes.put('/:id', async (req, res) => {
  res.json(await entries.updateEntry(currentUser(res).id, entryIdSchema.parse(req.params.id), updateEntrySchema.parse(req.body)));
});

entryRoutes.patch('/:id/paid', async (req, res) => {
  const { paid } = paidSchema.parse(req.body);
  res.json({ entry: await entries.setPaid(currentUser(res).id, entryIdSchema.parse(req.params.id), paid) });
});

entryRoutes.delete('/:id', async (req, res) => {
  await entries.deleteEntry(currentUser(res).id, entryIdSchema.parse(req.params.id));
  res.status(204).end();
});

entryRoutes.post('/:id/repeat', async (req, res) => {
  const { times } = repeatSchema.parse(req.body);
  const created = await entries.repeatEntry(currentUser(res).id, entryIdSchema.parse(req.params.id), times);
  res.status(201).json({ entries: created });
});
