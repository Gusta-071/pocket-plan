import { Router } from 'express';
import { z } from 'zod';
import { isValidDate, today } from '../../../../shared/period.js';
import { currentUser, requireAuth } from '../auth/auth.session.js';
import { getDashboard } from './dashboard.service.js';

export const dashboardRoutes = Router();

dashboardRoutes.use(requireAuth);

/** `date`: qualquer dia do período desejado; sem ele, o período atual. */
const querySchema = z.object({
  date: z.string().refine(isValidDate, { error: 'Data inválida.' }).optional(),
});

dashboardRoutes.get('/', async (req, res) => {
  const { date } = querySchema.parse(req.query);
  res.json(await getDashboard(currentUser(res).id, date ?? today()));
});
