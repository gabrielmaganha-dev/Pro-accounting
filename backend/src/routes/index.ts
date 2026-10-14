import type { FastifyInstance } from 'fastify';

import { auditRoutes } from './audit.routes.js';
import { authRoutes } from './auth.routes.js';
import { clientRoutes } from './client.routes.js';
import { contractRoutes } from './contract.routes.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { financeRoutes } from './finance.routes.js';
import { healthRoutes } from './health.routes.js';
import { invoiceRoutes } from './invoice.routes.js';
import { notificationRoutes } from './notification.routes.js';
import { paymentRoutes } from './payment.routes.js';
import { reportRoutes } from './report.routes.js';
import { settingsRoutes } from './settings.routes.js';
import { userRoutes } from './user.routes.js';

/**
 * Ponto único de registro de rotas. Montado sob o prefixo `/api` em app.ts,
 * então `/health` aqui vira `/api/health` na API.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(dashboardRoutes);
  await app.register(clientRoutes);
  await app.register(contractRoutes);
  await app.register(invoiceRoutes);
  await app.register(paymentRoutes);
  await app.register(financeRoutes);
  await app.register(reportRoutes);
  await app.register(notificationRoutes);
  await app.register(userRoutes);
  await app.register(settingsRoutes);
  await app.register(auditRoutes);
}
