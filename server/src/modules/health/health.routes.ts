import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

export const healthRoutes = Router();

healthRoutes.get('/', async (_req, res) => {
  let database: 'ok' | 'unavailable' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'unavailable';
  }
  res.status(database === 'ok' ? 200 : 503).json({ status: database === 'ok' ? 'ok' : 'degraded', database });
});
