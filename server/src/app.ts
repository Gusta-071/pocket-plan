import express from 'express';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
