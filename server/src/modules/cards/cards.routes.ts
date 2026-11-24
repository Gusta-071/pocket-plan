import { Router } from 'express';
import { currentUser, requireAuth } from '../auth/auth.session.js';
import { cardIdSchema, createCardSchema, updateCardSchema } from './cards.schemas.js';
import * as cards from './cards.service.js';

export const cardRoutes = Router();

cardRoutes.use(requireAuth);

cardRoutes.get('/', async (_req, res) => {
  res.json({ cards: await cards.listCards(currentUser(res).id) });
});

cardRoutes.post('/', async (req, res) => {
  res.status(201).json({ card: await cards.createCard(currentUser(res).id, createCardSchema.parse(req.body)) });
});

cardRoutes.patch('/:id', async (req, res) => {
  const card = await cards.updateCard(currentUser(res).id, cardIdSchema.parse(req.params.id), updateCardSchema.parse(req.body));
  res.json({ card });
});

cardRoutes.delete('/:id', async (req, res) => {
  await cards.deleteCard(currentUser(res).id, cardIdSchema.parse(req.params.id));
  res.status(204).end();
});
