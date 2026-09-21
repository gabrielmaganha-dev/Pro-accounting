import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  createClient,
  deleteClient,
  getClientById,
  getClientHistory,
  listClientInvoices,
  listClients,
  setClientStatus,
  updateClient,
} from '../services/client.service.js';
import { ok } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../utils/validate.js';
import {
  clientIdParamSchema,
  clientInvoicesQuerySchema,
  createClientSchema,
  historyQuerySchema,
  listClientsQuerySchema,
  updateClientSchema,
  updateClientStatusSchema,
} from '../validators/client.validator.js';

/** Lê o usuário da requisição. Inalcançável em rota protegida, mas explícito. */
function requireUser(request: FastifyRequest) {
  const user = request.currentUser;
  if (!user) throw AppError.unauthorized();
  return user;
}

/** GET /api/clients */
export async function listClientsController(request: FastifyRequest, reply: FastifyReply) {
  const query = validate(listClientsQuerySchema, request.query);
  const result = await listClients(query);

  return reply.status(200).send(ok(result));
}

/** GET /api/clients/:id */
export async function getClientController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = validate(clientIdParamSchema, request.params);
  const client = await getClientById(id);

  return reply.status(200).send(ok(client));
}

/** GET /api/clients/:id/history */
export async function getClientHistoryController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = validate(clientIdParamSchema, request.params);
  const { page, pageSize } = validate(historyQuerySchema, request.query);

  const history = await getClientHistory(id, page, pageSize);

  return reply.status(200).send(ok(history));
}

/** GET /api/clients/:id/invoices */
export async function listClientInvoicesController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id } = validate(clientIdParamSchema, request.params);
  const { status, page, pageSize } = validate(clientInvoicesQuerySchema, request.query);

  const invoices = await listClientInvoices(id, status, page, pageSize);

  return reply.status(200).send(ok(invoices));
}

/** POST /api/clients */
export async function createClientController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const input = validate(createClientSchema, request.body);

  const client = await createClient(input, user);

  // 201 com o recurso criado: a interface precisa do id para redirecionar
  // direto à página de detalhes do cliente recém-cadastrado.
  return reply.status(201).send(ok(client));
}

/** PUT /api/clients/:id */
export async function updateClientController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const { id } = validate(clientIdParamSchema, request.params);
  const input = validate(updateClientSchema, request.body);

  const client = await updateClient(id, input, user);

  return reply.status(200).send(ok(client));
}

/** PATCH /api/clients/:id/status */
export async function updateClientStatusController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const { id } = validate(clientIdParamSchema, request.params);
  const { status } = validate(updateClientStatusSchema, request.body);

  const client = await setClientStatus(id, status, user);

  return reply.status(200).send(ok(client));
}

/** DELETE /api/clients/:id */
export async function deleteClientController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = validate(clientIdParamSchema, request.params);

  await deleteClient(id);

  // 204 sem corpo: não há o que devolver sobre um registro que deixou de existir.
  return reply.status(204).send();
}
