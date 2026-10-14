import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  createContract,
  deleteContract,
  getContractById,
  listContractInvoices,
  listContracts,
  renewContract,
  setContractStatus,
  suggestNextNumber,
  updateContract,
} from '../services/contract.service.js';
import { recordAudit } from '../services/audit.service.js';
import { ok } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../utils/validate.js';
import {
  contractIdParamSchema,
  contractInvoicesQuerySchema,
  createContractSchema,
  listContractsQuerySchema,
  renewContractSchema,
  updateContractSchema,
  updateContractStatusSchema,
} from '../validators/contract.validator.js';

/** Lê o usuário da requisição. Inalcançável em rota protegida, mas explícito. */
function requireUser(request: FastifyRequest) {
  const user = request.currentUser;
  if (!user) throw AppError.unauthorized();
  return user;
}

/** GET /api/contracts */
export async function listContractsController(request: FastifyRequest, reply: FastifyReply) {
  const query = validate(listContractsQuerySchema, request.query);
  const result = await listContracts(query);

  return reply.status(200).send(ok(result));
}

/** GET /api/contracts/next-number */
export async function nextContractNumberController(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  const suggestion = await suggestNextNumber();

  return reply.status(200).send(ok(suggestion));
}

/** GET /api/contracts/:id */
export async function getContractController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = validate(contractIdParamSchema, request.params);
  const contract = await getContractById(id);

  return reply.status(200).send(ok(contract));
}

/** GET /api/contracts/:id/invoices */
export async function listContractInvoicesController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id } = validate(contractIdParamSchema, request.params);
  const { status, page, pageSize } = validate(contractInvoicesQuerySchema, request.query);

  const invoices = await listContractInvoices(id, status, page, pageSize);

  return reply.status(200).send(ok(invoices));
}

/** POST /api/contracts */
export async function createContractController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const input = validate(createContractSchema, request.body);

  const contract = await createContract(input);

  await recordAudit(user, {
    action: 'CREATE',
    entity: 'CONTRACT',
    entityId: contract.id,
    entityLabel: contract.number,
    metadata: { clientId: contract.clientId, valorMensal: contract.monthlyValue },
  });

  // 201 com o recurso criado: a interface precisa do id para redirecionar
  // direto à ficha do contrato recém-cadastrado.
  return reply.status(201).send(ok(contract));
}

/** PUT /api/contracts/:id */
export async function updateContractController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const { id } = validate(contractIdParamSchema, request.params);
  const input = validate(updateContractSchema, request.body);

  const contract = await updateContract(id, input, user);

  await recordAudit(user, {
    action: 'UPDATE',
    entity: 'CONTRACT',
    entityId: contract.id,
    entityLabel: contract.number,
    metadata: { camposEnviados: Object.keys(input) },
  });

  return reply.status(200).send(ok(contract));
}

/** PATCH /api/contracts/:id/status — encerrar, cancelar, reabrir. */
export async function updateContractStatusController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = requireUser(request);
  const { id } = validate(contractIdParamSchema, request.params);
  const { status } = validate(updateContractStatusSchema, request.body);

  const contract = await setContractStatus(id, status);

  // Encerrar e cancelar são ações distintas na trilha pelo mesmo motivo que
  // são distintas no negócio: um contrato cumprido e um desfeito não podem
  // aparecer com o mesmo rótulo numa auditoria.
  await recordAudit(user, {
    action: status === 'CANCELLED' ? 'CANCEL' : status === 'ACTIVE' ? 'REOPEN' : 'UPDATE',
    entity: 'CONTRACT',
    entityId: contract.id,
    entityLabel: contract.number,
    metadata: { situacao: status },
  });

  return reply.status(200).send(ok(contract));
}

/** POST /api/contracts/:id/renew */
export async function renewContractController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const { id } = validate(contractIdParamSchema, request.params);
  const input = validate(renewContractSchema, request.body);

  const contract = await renewContract(id, input);

  await recordAudit(user, {
    action: 'UPDATE',
    entity: 'CONTRACT',
    entityId: contract.id,
    entityLabel: contract.number,
    metadata: { renovacao: true, novoTermino: input.endDate },
  });

  return reply.status(200).send(ok(contract));
}

/** DELETE /api/contracts/:id */
export async function deleteContractController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const { id } = validate(contractIdParamSchema, request.params);

  // Lido antes da exclusão: depois não há de onde tirar o número.
  const contract = await getContractById(id);

  await deleteContract(id);

  await recordAudit(user, {
    action: 'DELETE',
    entity: 'CONTRACT',
    entityId: id,
    entityLabel: contract.number,
  });

  // 204 sem corpo: não há o que devolver sobre um registro que deixou de existir.
  return reply.status(204).send();
}
