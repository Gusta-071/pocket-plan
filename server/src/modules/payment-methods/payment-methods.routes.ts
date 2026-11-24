import { Router } from 'express';
import { currentUser, requireAuth } from '../auth/auth.session.js';
import { deletePaymentMethodQuerySchema, paymentMethodIdSchema, paymentMethodNameSchema } from './payment-methods.schemas.js';
import * as methods from './payment-methods.service.js';

export const paymentMethodRoutes = Router();

paymentMethodRoutes.use(requireAuth);

paymentMethodRoutes.get('/', async (_req, res) => {
  res.json({ paymentMethods: await methods.listPaymentMethods(currentUser(res).id) });
});

paymentMethodRoutes.post('/', async (req, res) => {
  const { name } = paymentMethodNameSchema.parse(req.body);
  res.status(201).json({ paymentMethod: await methods.createPaymentMethod(currentUser(res).id, name) });
});

paymentMethodRoutes.patch('/:id', async (req, res) => {
  const { name } = paymentMethodNameSchema.parse(req.body);
  res.json({ paymentMethod: await methods.renamePaymentMethod(currentUser(res).id, paymentMethodIdSchema.parse(req.params.id), name) });
});

paymentMethodRoutes.delete('/:id', async (req, res) => {
  const { moveTo } = deletePaymentMethodQuerySchema.parse(req.query);
  await methods.deletePaymentMethod(currentUser(res).id, paymentMethodIdSchema.parse(req.params.id), moveTo);
  res.status(204).end();
});
