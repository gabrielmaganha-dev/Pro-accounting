import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma.js';
import {
  apiCreateClient,
  apiCreateContract,
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

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  admin = await createUser(app, { role: 'ADMIN' });
  employee = await createUser(app, { role: 'EMPLOYEE' });
  clientId = (await apiCreateClient(app, admin.token, { name: 'Cliente da Fatura' })).id;
});

function validInvoice(overrides: Record<string, unknown> = {}) {
  return {
    clientId,
    number: 'fat-2026-00001',
    description: 'Honorários de março',
    amount: '1500.00',
    issueDate: isoToday(),
    dueDate: isoDaysFromToday(10),
    ...overrides,
  };
}

describe('emissão de fatura', () => {
  it('funcionário emite; nasce PENDENTE, com saldo integral e evento no histórico', async () => {
    const response = await request(app, 'POST', '/api/invoices', employee.token, validInvoice());

    expect(response.statusCode).toBe(201);
    const { data } = body(response);
    expect(data).toMatchObject({
      number: 'FAT-2026-00001',
      amount: '1500.00',
      paidAmount: '0.00',
      outstanding: '1500.00',
      status: 'PENDING',
      paymentCount: 0,
      client: { id: clientId },
      contractId: null,
    });

    const history = body(
      await request(app, 'GET', `/api/invoices/${data.id}/history`, admin.token),
    ).data.items;
    expect(history).toEqual([expect.objectContaining({ action: 'CREATED' })]);
  });

  it('ignora um `status` enviado no corpo: a situação é do servidor', async () => {
    const response = await request(
      app,
      'POST',
      '/api/invoices',
      admin.token,
      validInvoice({ status: 'PAID' }),
    );

    expect(body(response).data.status).toBe('PENDING');
  });

  describe('REGRA: fatura sem cliente', () => {
    it('recusa sem clientId (422 no campo clientId)', async () => {
      const { clientId: _omit, ...withoutClient } = validInvoice();

      const response = await request(app, 'POST', '/api/invoices', admin.token, withoutClient);

      expect(response.statusCode).toBe(422);
      expect(body(response).error.issues[0]).toMatchObject({
        field: 'clientId',
        message: 'Selecione o cliente da fatura.',
      });
    });

    it('recusa clientId vazio', async () => {
      const response = await request(
        app,
        'POST',
        '/api/invoices',
        admin.token,
        validInvoice({ clientId: '' }),
      );

      expect(response.statusCode).toBe(422);
    });

    it('recusa cliente inexistente com 404', async () => {
      const response = await request(
        app,
        'POST',
        '/api/invoices',
        admin.token,
        validInvoice({ clientId: 'nao-existe' }),
      );

      expect(response.statusCode).toBe(404);
      expect(body(response).error.message).toMatch(/Cliente não encontrado/);
    });

    it('recusa clientId nulo na edição', async () => {
      const invoice = await apiCreateInvoice(app, admin.token, clientId);

      const response = await request(app, 'PUT', `/api/invoices/${invoice.id}`, admin.token, {
        clientId: null,
      });

      expect(response.statusCode).toBe(422);
    });
  });

  it('vincula a um contrato do mesmo cliente', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId);

    const response = await request(
      app,
      'POST',
      '/api/invoices',
      admin.token,
      validInvoice({ contractId: contract.id }),
    );

    expect(response.statusCode).toBe(201);
    expect(body(response).data.contract).toMatchObject({ id: contract.id });
  });

  it('recusa contrato de OUTRO cliente', async () => {
    const otherClient = await apiCreateClient(app, admin.token, { name: 'Outro Cliente' });
    const foreignContract = await apiCreateContract(app, admin.token, otherClient.id);

    const response = await request(
      app,
      'POST',
      '/api/invoices',
      admin.token,
      validInvoice({ contractId: foreignContract.id }),
    );

    expect(response.statusCode).toBe(422);
    expect(body(response).error.issues[0].field).toBe('contractId');
  });

  it('recusa trocar o cliente mantendo o contrato do cliente anterior', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId);
    const invoice = await apiCreateInvoice(app, admin.token, clientId, { contractId: contract.id });
    const otherClient = await apiCreateClient(app, admin.token);

    const response = await request(app, 'PUT', `/api/invoices/${invoice.id}`, admin.token, {
      clientId: otherClient.id,
    });

    expect(response.statusCode).toBe(422);
  });

  it('recusa número duplicado, valor inválido e vencimento antes da emissão', async () => {
    await request(app, 'POST', '/api/invoices', admin.token, validInvoice());

    const duplicate = await request(app, 'POST', '/api/invoices', admin.token, validInvoice());
    expect(duplicate.statusCode).toBe(409);

    for (const change of [
      { number: 'X1', amount: '0' },
      { number: 'X2', amount: '-1' },
      { number: 'X3', amount: 'mil reais' },
      { number: 'X4', dueDate: isoDaysFromToday(-1) },
      { number: 'X5', issueDate: '2026-02-30' },
    ]) {
      const response = await request(app, 'POST', '/api/invoices', admin.token, validInvoice(change));
      expect(response.statusCode, JSON.stringify(change)).toBe(422);
    }
  });
});

describe('situação efetiva', () => {
  it('pendente com vencimento no passado aparece como ATRASADA, sem gravar OVERDUE', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId, {
      issueDate: isoDaysFromToday(-40),
      dueDate: isoDaysFromToday(-5),
    });

    const detail = body(await request(app, 'GET', `/api/invoices/${invoice.id}`, admin.token)).data;
    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });

    expect(detail).toMatchObject({ status: 'OVERDUE', storedStatus: 'PENDING', daysOverdue: 5 });
    expect(stored.status).toBe('PENDING');
  });

  it('filtros PENDENTE e ATRASADA não se sobrepõem', async () => {
    await apiCreateInvoice(app, admin.token, clientId, {
      issueDate: isoDaysFromToday(-40),
      dueDate: isoDaysFromToday(-5),
    });
    await apiCreateInvoice(app, admin.token, clientId, { dueDate: isoToday() });

    const overdue = body(await request(app, 'GET', '/api/invoices?status=OVERDUE', admin.token)).data;
    const pending = body(await request(app, 'GET', '/api/invoices?status=PENDING', admin.token)).data;

    expect(overdue.total).toBe(1);
    expect(pending.total).toBe(1);
    expect(overdue.items[0].id).not.toBe(pending.items[0].id);
  });
});

describe('edição, cancelamento e exclusão', () => {
  it('não edita fatura cancelada', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId);
    await request(app, 'PATCH', `/api/invoices/${invoice.id}/status`, admin.token, {
      status: 'CANCELLED',
    });

    const response = await request(app, 'PUT', `/api/invoices/${invoice.id}`, admin.token, {
      amount: '10.00',
    });

    expect(response.statusCode).toBe(409);
  });

  it('não reduz o valor abaixo do que já foi pago', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId, { amount: '1000.00' });
    await request(app, 'POST', `/api/invoices/${invoice.id}/payment`, admin.token, {
      amount: '600.00',
      paymentDate: isoToday(),
      paymentMethod: 'PIX',
    });

    const response = await request(app, 'PUT', `/api/invoices/${invoice.id}`, admin.token, {
      amount: '500.00',
    });

    expect(response.statusCode).toBe(422);
  });

  it('baixar o valor para o que já foi pago quita a fatura', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId, { amount: '1000.00' });
    await request(app, 'POST', `/api/invoices/${invoice.id}/payment`, admin.token, {
      amount: '600.00',
      paymentDate: isoToday(),
      paymentMethod: 'PIX',
    });

    const response = await request(app, 'PUT', `/api/invoices/${invoice.id}`, admin.token, {
      amount: '600.00',
    });

    expect(body(response).data).toMatchObject({ status: 'PAID', outstanding: '0.00' });
  });

  it('cancela e reabre, registrando os dois eventos', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId);

    const cancel = await request(app, 'PATCH', `/api/invoices/${invoice.id}/status`, admin.token, {
      status: 'CANCELLED',
    });
    const reopen = await request(app, 'PATCH', `/api/invoices/${invoice.id}/status`, admin.token, {
      status: 'PENDING',
    });

    expect(body(cancel).data.status).toBe('CANCELLED');
    expect(body(reopen).data.status).toBe('PENDING');

    const actions = body(
      await request(app, 'GET', `/api/invoices/${invoice.id}/history`, admin.token),
    ).data.items.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['CANCELLED', 'REOPENED']));
  });

  it('não aceita PAID nem OVERDUE como situação manual', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId);

    for (const status of ['PAID', 'OVERDUE']) {
      const response = await request(app, 'PATCH', `/api/invoices/${invoice.id}/status`, admin.token, {
        status,
      });
      expect(response.statusCode).toBe(422);
    }
  });

  it('não cancela nem exclui fatura com pagamento', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId);
    await request(app, 'POST', `/api/invoices/${invoice.id}/payment`, admin.token, {
      amount: '100.00',
      paymentDate: isoToday(),
      paymentMethod: 'PIX',
    });

    const cancel = await request(app, 'PATCH', `/api/invoices/${invoice.id}/status`, admin.token, {
      status: 'CANCELLED',
    });
    const remove = await request(app, 'DELETE', `/api/invoices/${invoice.id}`, admin.token);

    expect(cancel.statusCode).toBe(409);
    expect(remove.statusCode).toBe(409);
    expect(await prisma.payment.count()).toBe(1);
  });

  it('exclui fatura sem pagamento', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId);

    const response = await request(app, 'DELETE', `/api/invoices/${invoice.id}`, admin.token);

    expect(response.statusCode).toBe(204);
  });
});
