import type { FastifyReply, FastifyRequest } from 'fastify';

import { getDashboard } from '../services/dashboard.service.js';
import { ok } from '../utils/api-response.js';

/**
 * GET /api/dashboard
 *
 * Um único endpoint entrega cards, gráficos, alertas e atividade recente.
 *
 * Por que não vários endpoints menores: o painel precisa que todos os números
 * venham do MESMO instante do banco. Com chamadas separadas, um pagamento
 * registrado entre duas delas faria o card "Total recebido" e o gráfico de
 * receita discordarem — e nada na tela explicaria a diferença.
 *
 * O serviço executa tudo em uma transação e devolve o conjunto coerente.
 */
export async function dashboardController(_request: FastifyRequest, reply: FastifyReply) {
  const dashboard = await getDashboard();

  return reply.status(200).send(ok(dashboard));
}
