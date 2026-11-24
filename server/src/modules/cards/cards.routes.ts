import { Router } from 'express';
import { z } from 'zod';
import { isValidDate } from '../../../../shared/period.js';
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

const dueSchema = z.string().refine(isValidDate, { error: 'Fatura inválida.' });
const invoicePaidSchema = z.object({ paid: z.boolean({ error: 'Informe se a fatura está paga.' }) });

/** RN-53, RN-53b */
cardRoutes.get('/:id/invoices', async (req, res) => {
  res.json({ invoices: await cards.listInvoices(currentUser(res).id, cardIdSchema.parse(req.params.id)) });
});

/** RN-54 */
cardRoutes.patch('/:id/invoices/:due', async (req, res) => {
  const { paid } = invoicePaidSchema.parse(req.body);
  await cards.setInvoicePaid(currentUser(res).id, cardIdSchema.parse(req.params.id), dueSchema.parse(req.params.due), paid);
  res.status(204).end();
});
