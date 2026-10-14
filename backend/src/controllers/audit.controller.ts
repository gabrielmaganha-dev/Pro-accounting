import type { FastifyReply, FastifyRequest } from 'fastify';

import { getAuditSummary, listAuditLogs } from '../services/audit.service.js';
import { ok } from '../utils/api-response.js';
import { validate } from '../utils/validate.js';
import { listAuditQuerySchema } from '../validators/audit.validator.js';

/** GET /api/audit-logs */
export async function listAuditLogsController(request: FastifyRequest, reply: FastifyReply) {
  const query = validate(listAuditQuerySchema, request.query);

  const [result, summary] = await Promise.all([listAuditLogs(query), getAuditSummary()]);

  return reply.status(200).send(ok({ ...result, summary }));
}
