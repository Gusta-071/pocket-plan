import { Router } from 'express';
import { today } from '../../../../shared/period.js';
import { currentUser, requireAuth } from '../auth/auth.session.js';
import { budgetsQuerySchema, setBudgetSchema } from './budgets.schemas.js';
import { getBudgets, setBudget } from './budgets.service.js';

export const budgetRoutes = Router();

budgetRoutes.use(requireAuth);

/** Limites e metas em vigor no período que contém `date` (padrão: hoje). */
budgetRoutes.get('/', async (req, res) => {
  const { date } = budgetsQuerySchema.parse(req.query);
  res.json(await getBudgets(currentUser(res).id, date ?? today()));
});

/** Define ou remove um limite ou uma meta, a partir do período atual (RN-30). */
budgetRoutes.put('/', async (req, res) => {
  const input = setBudgetSchema.parse(req.body);
  res.json(await setBudget(currentUser(res).id, input));
});
