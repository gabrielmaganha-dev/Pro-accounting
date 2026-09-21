import type { FastifyReply, FastifyRequest } from 'fastify';

import { getPaymentById, listPayments } from '../services/payment.service.js';
import { ok } from '../utils/api-response.js';
import { validate } from '../utils/validate.js';
import {
  listPaymentsQuerySchema,
  paymentIdOnlyParamSchema,
} from '../validators/payment.validator.js';

/** GET /api/payments */
export async function listPaymentsController(request: FastifyRequest, reply: FastifyReply) {
  const query = validate(listPaymentsQuerySchema, request.query);
  const result = await listPayments(query);

  return reply.status(200).send(ok(result));
}

/** GET /api/payments/:id */
export async function getPaymentController(request: FastifyRequest, reply: FastifyReply) {
  const { id } = validate(paymentIdOnlyParamSchema, request.params);
  const payment = await getPaymentById(id);

  return reply.status(200).send(ok(payment));
}
