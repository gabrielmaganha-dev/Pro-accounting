import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  createInvoice,
  deleteInvoice,
  getInvoiceById,
  getInvoiceHistory,
  listInvoicePayments,
  listInvoices,
  registerPayment,
  removePayment,
  setInvoiceStatus,
  suggestNextNumber,
  updateInvoice,
} from '../services/invoice.service.js';
import { recordAudit } from '../services/audit.service.js';
import { ok } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../utils/validate.js';
import {
  createInvoiceSchema,
  invoiceHistoryQuerySchema,
  invoiceIdParamSchema,
  listInvoicesQuerySchema,
  paymentIdParamSchema,
  registerPaymentSchema,
  updateInvoiceSchema,
  updateInvoiceStatusSchema,
} from '../validators/invoice.validator.js';

/** Lê o usuário da requisição. Inalcançável em rota protegida, mas explícito. */
function requireUser(request: FastifyRequest) {
  const user = request.currentUser;
  if (!user) throw AppError.unauthorized();
  return user;
}

/** GET /api/invoices */
export async function listInvoicesController(request: FastifyRequest, reply: FastifyReply) {
  const query = validate(listInvoicesQuerySchema, request.query);
  const result = await listInvoices(query);

  return reply.status(200).send(ok(result));
}

/** GET /api/invoices/next-number */
export async function nextInvoiceNumberController(_request: FastifyRequest, reply: FastifyReply) {
  const suggestion = await suggestNextNumber();

  return reply.status(200).send(ok(suggestion));
}

/** GET /api/invoices/:id */
export async function getInvoiceController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = validate(invoiceIdParamSchema, request.params);
  const invoice = await getInvoiceById(id);

  return reply.status(200).send(ok(invoice));
}

/** GET /api/invoices/:id/history */
export async function getInvoiceHistoryController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = validate(invoiceIdParamSchema, request.params);
  const { page, pageSize } = validate(invoiceHistoryQuerySchema, request.query);

  const history = await getInvoiceHistory(id, page, pageSize);

  return reply.status(200).send(ok(history));
}

/** GET /api/invoices/:id/payments */
export async function listInvoicePaymentsController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id } = validate(invoiceIdParamSchema, request.params);
  const payments = await listInvoicePayments(id);

  return reply.status(200).send(ok(payments));
}

/** POST /api/invoices */
export async function createInvoiceController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const input = validate(createInvoiceSchema, request.body);

  const invoice = await createInvoice(input, user);

  await recordAudit(user, {
    action: 'CREATE',
    entity: 'INVOICE',
    entityId: invoice.id,
    entityLabel: invoice.number,
    metadata: { clientId: invoice.clientId, valor: invoice.amount, vencimento: invoice.dueDate },
  });

  // 201 com o recurso criado: a interface precisa do id para redirecionar
  // direto à ficha da fatura recém-emitida.
  return reply.status(201).send(ok(invoice));
}

/** PUT /api/invoices/:id */
export async function updateInvoiceController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const { id } = validate(invoiceIdParamSchema, request.params);
  const input = validate(updateInvoiceSchema, request.body);

  const invoice = await updateInvoice(id, input, user);

  await recordAudit(user, {
    action: 'UPDATE',
    entity: 'INVOICE',
    entityId: invoice.id,
    entityLabel: invoice.number,
    metadata: { camposEnviados: Object.keys(input) },
  });

  return reply.status(200).send(ok(invoice));
}

/** PATCH /api/invoices/:id/status — cancelar ou reabrir. */
export async function updateInvoiceStatusController(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const user = requireUser(request);
  const { id } = validate(invoiceIdParamSchema, request.params);
  const { status } = validate(updateInvoiceStatusSchema, request.body);

  const invoice = await setInvoiceStatus(id, status, user);

  await recordAudit(user, {
    action: status === 'CANCELLED' ? 'CANCEL' : 'REOPEN',
    entity: 'INVOICE',
    entityId: invoice.id,
    entityLabel: invoice.number,
    metadata: { situacao: status },
  });

  return reply.status(200).send(ok(invoice));
}

/** POST /api/invoices/:id/payments */
export async function registerPaymentController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const { id } = validate(invoiceIdParamSchema, request.params);
  const input = validate(registerPaymentSchema, request.body);

  const invoice = await registerPayment(id, input, user);

  // Dinheiro entrando é o evento mais sensível do sistema: valor, data e forma
  // ficam na trilha, não só "houve um pagamento".
  await recordAudit(user, {
    action: 'PAYMENT_REGISTERED',
    entity: 'PAYMENT',
    entityId: invoice.id,
    entityLabel: invoice.number,
    metadata: {
      // `toFixed(2)` porque o validador devolve `number` e a trilha guarda
      // dinheiro no mesmo formato canônico do resto do sistema: string de duas
      // casas. Gravar `250` onde todo lugar mostra "250.00" obrigaria quem lê a
      // auditoria a conferir se o valor está completo ou truncado.
      valor: input.amount.toFixed(2),
      data: input.paymentDate,
      forma: input.paymentMethod,
      situacaoDaFatura: invoice.status,
    },
  });

  return reply.status(201).send(ok(invoice));
}

/** DELETE /api/invoices/:id/payments/:paymentId — estorno. */
export async function removePaymentController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const { id, paymentId } = validate(paymentIdParamSchema, request.params);

  const invoice = await removePayment(id, paymentId, user);

  await recordAudit(user, {
    action: 'PAYMENT_REVERSED',
    entity: 'PAYMENT',
    entityId: paymentId,
    entityLabel: invoice.number,
    metadata: { faturaId: invoice.id, situacaoDaFatura: invoice.status },
  });

  return reply.status(200).send(ok(invoice));
}

/** DELETE /api/invoices/:id */
export async function deleteInvoiceController(request: FastifyRequest, reply: FastifyReply) {
  const user = requireUser(request);
  const { id } = validate(invoiceIdParamSchema, request.params);

  const invoice = await getInvoiceById(id);

  await deleteInvoice(id);

  await recordAudit(user, {
    action: 'DELETE',
    entity: 'INVOICE',
    entityId: id,
    entityLabel: invoice.number,
    metadata: { valor: invoice.amount },
  });

  // 204 sem corpo: não há o que devolver sobre um registro que deixou de existir.
  return reply.status(204).send();
}
