import { Router } from 'express';
import { z } from 'zod';
import { isValidDate, today } from '../../../../shared/period.js';
import { currentUser, requireAuth } from '../auth/auth.session.js';
import { getBills } from './bills.service.js';

export const billRoutes = Router();

billRoutes.use(requireAuth);

/** `date`: qualquer dia do período desejado; sem ele, o período atual. */
const querySchema = z.object({
  date: z.string().refine(isValidDate, { error: 'Data inválida.' }).optional(),
});

billRoutes.get('/', async (req, res) => {
  const { date } = querySchema.parse(req.query);
  res.json(await getBills(currentUser(res).id, date ?? today()));
});
