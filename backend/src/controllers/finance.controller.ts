import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  exportFinanceEntries,
  getFinanceEntries,
  getFinanceOverview,
} from '../services/finance.service.js';
import { ok } from '../utils/api-response.js';
import { validate } from '../utils/validate.js';
import {
  financeEntriesQuerySchema,
  financeExportQuerySchema,
  financeOverviewQuerySchema,
} from '../validators/finance.validator.js';

/** GET /api/finance/overview */
export async function financeOverviewController(request: FastifyRequest, reply: FastifyReply) {
  const query = validate(financeOverviewQuerySchema, request.query);
  const overview = await getFinanceOverview(query);

  return reply.status(200).send(ok(overview));
}

/** GET /api/finance/entries */
export async function financeEntriesController(request: FastifyRequest, reply: FastifyReply) {
  const query = validate(financeEntriesQuerySchema, request.query);
  const entries = await getFinanceEntries(query);

  return reply.status(200).send(ok(entries));
}

/**
 * GET /api/finance/export
 *
 * Única rota da API que NÃO usa o envelope `{ success, data }`: o navegador
 * precisa receber o arquivo cru, com o `Content-Disposition` que dispara o
 * download. Embrulhar o CSV em JSON obrigaria o frontend a desembrulhar e
 * remontar o arquivo, que é trabalho para desfazer algo que já estava pronto.
 */
export async function financeExportController(request: FastifyRequest, reply: FastifyReply) {
  const query = validate(financeExportQuerySchema, request.query);
  const result = await exportFinanceEntries(query);

  return reply
    .status(200)
    .header('Content-Type', result.contentType)
    .header('Content-Disposition', `attachment; filename="${result.filename}"`)
    .send(result.body);
}
