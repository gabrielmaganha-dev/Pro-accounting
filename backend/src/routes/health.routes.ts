import type { FastifyInstance } from 'fastify';

import { healthController } from '../controllers/health.controller.js';

/**
 * Rota pública de diagnóstico. Fica fora da autenticação de propósito: um
 * monitor precisa conseguir verificar a API sem possuir credenciais.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', healthController);
}
