import express from 'express';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { assistantRoutes } from './modules/assistant/assistant.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { budgetRoutes } from './modules/budgets/budgets.routes.js';
import { categoryRoutes } from './modules/categories/categories.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { entryRoutes } from './modules/entries/entries.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/budgets', budgetRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/entries', entryRoutes);
  app.use('/api/settings', settingsRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
