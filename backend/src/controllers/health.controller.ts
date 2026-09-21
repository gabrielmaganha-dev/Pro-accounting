import type { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../config/env.js';
import { isDatabaseReachable } from '../config/prisma.js';

/**
 * GET /api/health
 *
 * Única rota que não usa o envelope `{ success, data }`: health checks são
 * consumidos por load balancers e monitores, que esperam o corpo cru e se
 * guiam pelo status HTTP.
 *
 * Executa um `SELECT 1` de verdade — um health check que só responde "ok"
 * porque o processo Node está vivo não prova nada sobre o banco.
 */
export async function healthController(_request: FastifyRequest, reply: FastifyReply) {
  const databaseReachable = await isDatabaseReachable();

  return reply.status(databaseReachable ? 200 : 503).send({
    status: databaseReachable ? 'ok' : 'degraded',
    service: 'pro-accounting-api',
    environment: env.NODE_ENV,
    database: databaseReachable ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
