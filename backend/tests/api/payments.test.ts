import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma.js';
import {
  apiCreateClient,
  apiCreateInvoice,
  body,
  createTestApp,
  createUser,
  isoDaysFromToday,
  isoToday,
  request,
  type TestUser,
} from '../helpers.js';

let app: FastifyInstance;
let admin: TestUser;
let employee: TestUser;
let clientId: string;
let invoiceId: string;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  admin = await createUser(app, { role: 'ADMIN' });
  employee = await createUser(app, { role: 'EMPLOYEE' });
  clientId = (await apiCreateClient(app, admin.token, { name: 'Cliente Pagador' })).id;
  invoiceId = (await apiCreateInvoice(app, admin.token, clientId, { amount: '1000.00' })).id;
});

function pay(token: string, payload: Record<string, unknown>, id = invoiceId) {
  return request(app, 'POST', `/api/invoices/${id}/payment`, token, {
    amount: '400.00',
    paymentDate: isoToday(),
    paymentMethod: 'PIX',
    ...payload,
  });
}

describe('registro de pagamento', () => {
  it('pagamento parcial mantém a fatura pendente e registra o autor', async () => {
    const response = await pay(employee.token, { amount: '400.00' });

    expect(response.statusCode).toBe(201);
    expect(body(response).data).toMatchObject({
      status: 'PENDING',
      paidAmount: '400.00',
      outstanding: '600.00',
      paymentCount: 1,
    });

    const payments = body(await request(app, 'GET', `/api/invoices/${invoiceId}/payments`, admin.token))
      .data;
    expect(payments).toEqual([
      expect.objectContaining({ amount: '400.00', registeredByName: employee.name }),
    ]);
  });

  it('o pagamento que zera o saldo quita a fatura e gera SETTLED', async () => {
    await pay(admin.token, { amount: '400.00' });
    const response = await pay(admin.token, { amount: '600.00', paymentMethod: 'BOLETO' });

    expect(body(response).data).toMatchObject({ status: 'PAID', outstanding: '0.00' });

    const actions = body(
      await request(app, 'GET', `/api/invoices/${invoiceId}/history`, admin.token),
    ).data.items.map((entry: { action: string }) => entry.action);
    expect(actions.filter((action: string) => action === 'PAYMENT_ADDED')).toHaveLength(2);
    expect(actions.filter((action: string) => action === 'SETTLED')).toHaveLength(1);
  });

  it('funciona também em POST /invoices/:id/payments (plural)', async () => {
    const response = await request(app, 'POST', `/api/invoices/${invoiceId}/payments`, admin.token, {
      amount: '1000.00',
      paymentDate: isoToday(),
      paymentMethod: 'CASH',
    });

    expect(response.statusCode).toBe(201);
    expect(body(response).data.status).toBe('PAID');
  });

  it('centavos não se perdem em pagamentos fracionados', async () => {
    const odd = await apiCreateInvoice(app, admin.token, clientId, { amount: '0.30' });

    await pay(admin.token, { amount: '0.10' }, odd.id);
    const response = await pay(admin.token, { amount: '0.20', paymentMethod: 'CASH' }, odd.id);

    expect(body(response).data).toMatchObject({ status: 'PAID', paidAmount: '0.30' });
  });
});

describe('REGRA: pagamento inválido', () => {
  it.each([
    ['valor zero', { amount: '0' }],
    ['valor negativo', { amount: '-50.00' }],
    ['valor não numérico', { amount: 'cem reais' }],
    ['valor ausente', { amount: undefined }],
    ['forma de pagamento desconhecida', { paymentMethod: 'BITCOIN' }],
    ['forma de pagamento ausente', { paymentMethod: undefined }],
    ['data inexistente', { paymentDate: '2026-02-30' }],
    ['data em formato errado', { paymentDate: '10/03/2026' }],
    ['data ausente', { paymentDate: undefined }],
  ])('recusa %s com 422', async (_label, change) => {
    const response = await pay(admin.token, change);

    expect(response.statusCode).toBe(422);
    expect(body(response).error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.payment.count()).toBe(0);
  });

  it('recusa data de pagamento no futuro', async () => {
    const response = await pay(admin.token, { paymentDate: isoDaysFromToday(1) });

    expect(response.statusCode).toBe(422);
    expect(body(response).error.issues[0].field).toBe('paymentDate');
    expect(await prisma.payment.count()).toBe(0);
  });

  it('recusa valor acima do saldo em aberto e informa o saldo', async () => {
    await pay(admin.token, { amount: '700.00' });

    const response = await pay(admin.token, { amount: '300.01', paymentMethod: 'CASH' });

    expect(response.statusCode).toBe(422);
    expect(body(response).error.message).toMatch(/saldo em aberto de R\$\s300,00/);
  });

  it('recusa pagamento em fatura já quitada', async () => {
    await pay(admin.token, { amount: '1000.00' });

    const response = await pay(admin.token, { amount: '1.00', paymentMethod: 'CASH' });

    expect(response.statusCode).toBe(409);
    expect(body(response).error.message).toBe('Esta fatura já está quitada.');
  });

  it('recusa pagamento em fatura cancelada', async () => {
    await request(app, 'PATCH', `/api/invoices/${invoiceId}/status`, admin.token, {
      status: 'CANCELLED',
    });

    const response = await pay(admin.token, {});

    expect(response.statusCode).toBe(409);
  });

  it('recusa pagamento em fatura inexistente', async () => {
    const response = await pay(admin.token, {}, 'fatura-inexistente');

    expect(response.statusCode).toBe(404);
  });

  it('recusa duplicata acidental (mesmo valor, data e forma) sem confirmação', async () => {
    await pay(admin.token, { amount: '100.00' });

    const duplicate = await pay(admin.token, { amount: '100.00' });
    const confirmedAsText = await pay(admin.token, { amount: '100.00', confirmDuplicate: 'false' });
    const confirmed = await pay(admin.token, { amount: '100.00', confirmDuplicate: true });

    expect(duplicate.statusCode).toBe(409);
    expect(confirmedAsText.statusCode).toBe(409);
    expect(confirmed.statusCode).toBe(201);
    expect(await prisma.payment.count()).toBe(2);
  });

  it('pagamentos simultâneos não ultrapassam o valor da fatura', async () => {
    const responses = await Promise.all([
      pay(admin.token, { amount: '1000.00', paymentMethod: 'PIX' }),
      pay(admin.token, { amount: '1000.00', paymentMethod: 'CASH' }),
      pay(admin.token, { amount: '1000.00', paymentMethod: 'BOLETO' }),
    ]);

    const created = responses.filter((response) => response.statusCode === 201);
    expect(created).toHaveLength(1);

    const total = await prisma.payment.aggregate({ _sum: { amount: true } });
    expect(total._sum.amount?.toFixed(2)).toBe('1000.00');
  });
});

describe('estorno', () => {
  it('admin estorna; a fatura quitada volta a pendente e o estorno fica no histórico', async () => {
    await pay(admin.token, { amount: '1000.00' });
    const [payment] = body(
      await request(app, 'GET', `/api/invoices/${invoiceId}/payments`, admin.token),
    ).data;

    const response = await request(
      app,
      'DELETE',
      `/api/invoices/${invoiceId}/payments/${payment.id}`,
      admin.token,
    );

    expect(response.statusCode).toBe(200);
    expect(body(response).data).toMatchObject({ status: 'PENDING', outstanding: '1000.00' });

    const actions = body(
      await request(app, 'GET', `/api/invoices/${invoiceId}/history`, admin.token),
    ).data.items.map((entry: { action: string }) => entry.action);
    expect(actions).toContain('PAYMENT_REMOVED');
  });

  it('não estorna pagamento de OUTRA fatura pela rota desta', async () => {
    const other = await apiCreateInvoice(app, admin.token, clientId);
    await pay(admin.token, { amount: '100.00' }, other.id);
    const [foreign] = body(
      await request(app, 'GET', `/api/invoices/${other.id}/payments`, admin.token),
    ).data;

    const response = await request(
      app,
      'DELETE',
      `/api/invoices/${invoiceId}/payments/${foreign.id}`,
      admin.token,
    );

    expect(response.statusCode).toBe(404);
    expect(await prisma.payment.count()).toBe(1);
  });
});

describe('histórico de pagamentos (GET /payments)', () => {
  it('lista, filtra e soma TODOS os pagamentos do filtro, não só a página', async () => {
    await pay(admin.token, { amount: '100.00', paymentMethod: 'PIX' });
    await pay(admin.token, { amount: '200.00', paymentMethod: 'CASH' });
    await pay(employee.token, { amount: '300.00', paymentMethod: 'BOLETO' });

    const all = body(await request(app, 'GET', '/api/payments?pageSize=1', employee.token)).data;
    expect(all).toMatchObject({ total: 3, totalAmount: '600.00' });
    expect(all.items).toHaveLength(1);

    const pix = body(await request(app, 'GET', '/api/payments?paymentMethod=PIX', admin.token)).data;
    expect(pix).toMatchObject({ total: 1, totalAmount: '100.00' });

    const byEmployee = body(
      await request(app, 'GET', `/api/payments?registeredBy=${employee.id}`, admin.token),
    ).data;
    expect(byEmployee.total).toBe(1);

    const byClient = body(
      await request(app, 'GET', '/api/payments?search=pagador', admin.token),
    ).data;
    expect(byClient.total).toBe(3);
  });

  it('detalhe traz o contexto da fatura', async () => {
    await pay(admin.token, { amount: '250.00' });
    const [payment] = body(await request(app, 'GET', '/api/payments', admin.token)).data.items;

    const response = await request(app, 'GET', `/api/payments/${payment.id}`, employee.token);

    expect(body(response).data.invoiceContext).toEqual({
      paidAmount: '250.00',
      outstanding: '750.00',
      paymentCount: 1,
    });
  });

  it('não existe criação avulsa de pagamento', async () => {
    const response = await request(app, 'POST', '/api/payments', admin.token, {
      amount: '10.00',
      paymentDate: isoToday(),
      paymentMethod: 'PIX',
    });

    expect(response.statusCode).toBe(404);
  });
});
