import type { FastifyInstance } from 'fastify';

import { healthController } from '../controllers/health.controller.js';

/**
 * Rota pública de diagnóstico. Fica fora da autenticação de propósito: um
 * monitor precisa conseguir verificar a API sem possuir credenciais.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * `logLevel: 'warn'`: o orquestrador bate nesta rota a cada poucos segundos.
   * No nível padrão seriam duas linhas de log por verificação — milhares por
   * dia dizendo "200" — enterrando as linhas que importam. Com `warn`, a rota
   * só aparece no log quando algo dá errado.
   */
  app.get('/health', { logLevel: 'warn' }, healthController);
}
