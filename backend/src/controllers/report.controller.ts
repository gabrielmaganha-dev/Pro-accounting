import type { FastifyReply, FastifyRequest } from 'fastify';

import { exportReport, getCatalog, runReport } from '../services/report.service.js';
import { recordAudit } from '../services/audit.service.js';
import { ok } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../utils/validate.js';
import {
  reportExportQuerySchema,
  reportIdParamSchema,
  reportQuerySchema,
} from '../validators/report.validator.js';

/** Lê o usuário da requisição. Inalcançável em rota protegida, mas explícito. */
function requireUser(request: FastifyRequest) {
  const user = request.currentUser;
  if (!user) throw AppError.unauthorized();
  return user;
}

/**
 * GET /api/reports
 *
 * Catálogo do que existe. O conteúdo varia por perfil: o funcionário não recebe
 * os relatórios financeiros, então a interface dele nem chega a oferecê-los.
 * Isso é conveniência — quem protege é a checagem no serviço, que roda também
 * quando alguém pede o relatório pelo id direto.
 */
export async function listReportsController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);

  return reply.status(200).send(ok({ reports: getCatalog(actor) }));
}

/** GET /api/reports/:id */
export async function runReportController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const { id } = validate(reportIdParamSchema, request.params);
  const { page, pageSize, ...filters } = validate(reportQuerySchema, request.query);

  const result = await runReport(id, filters, page, pageSize, actor);

  return reply.status(200).send(ok(result));
}

/**
 * GET /api/reports/:id/export
 *
 * Junto com `/finance/export`, a única rota que NÃO usa o envelope
 * `{ success, data }`: o navegador precisa receber o arquivo cru, com o
 * `Content-Disposition` que dispara o download. Embrulhar um PDF em JSON
 * obrigaria o frontend a desembrulhar e remontar o arquivo — trabalho para
 * desfazer algo que já estava pronto.
 */
export async function exportReportController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const { id } = validate(reportIdParamSchema, request.params);
  const { format, page: _page, pageSize: _pageSize, ...filters } = validate(
    reportExportQuerySchema,
    request.query,
  );

  const file = await exportReport(id, format, filters, actor);

  /**
   * Exportação é registrada porque é EXTRAÇÃO DE DADOS.
   *
   * Um arquivo com a carteira inteira de clientes, ou com o financeiro do ano,
   * sai do sistema e passa a circular fora dele. É o evento que mais interessa
   * numa investigação de vazamento — e o único em que o dado sai sem que nada
   * mude no banco, então sem esta linha não deixaria rastro nenhum.
   */
  await recordAudit(actor, {
    action: 'EXPORT',
    entity: 'REPORT',
    entityId: id,
    entityLabel: file.filename,
    metadata: { formato: format, filtros: filters },
  });

  return reply
    .status(200)
    .header('Content-Type', file.contentType)
    .header('Content-Disposition', `attachment; filename="${file.filename}"`)
    // Sem isto o `fetch` do navegador não enxerga o cabeçalho e o arquivo salvo
    // fica com o nome da rota em vez do nome do relatório.
    .header('Access-Control-Expose-Headers', 'Content-Disposition')
    .send(file.body);
}
