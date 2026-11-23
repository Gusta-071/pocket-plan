import { Router } from 'express';
import { currentUser, requireAuth } from '../auth/auth.session.js';
import {
  categoryIdSchema,
  createCategorySchema,
  deleteCategoryQuerySchema,
  updateCategorySchema,
} from './categories.schemas.js';
import * as categories from './categories.service.js';

export const categoryRoutes = Router();

// Todas as rotas exigem sessão e e-mail confirmado (RN-08, RN-09g); o usuário vem da sessão (RN-04).
categoryRoutes.use(requireAuth);

categoryRoutes.get('/', async (_req, res) => {
  res.json({ categories: await categories.listCategories(currentUser(res).id) });
});

categoryRoutes.post('/', async (req, res) => {
  const category = await categories.createCategory(currentUser(res).id, createCategorySchema.parse(req.body));
  res.status(201).json({ category });
});

categoryRoutes.patch('/:id', async (req, res) => {
  const category = await categories.updateCategory(
    currentUser(res).id,
    categoryIdSchema.parse(req.params.id),
    updateCategorySchema.parse(req.body),
  );
  res.json({ category });
});

categoryRoutes.delete('/:id', async (req, res) => {
  const { moveTo } = deleteCategoryQuerySchema.parse(req.query);
  await categories.deleteCategory(currentUser(res).id, categoryIdSchema.parse(req.params.id), moveTo);
  res.status(204).end();
});
