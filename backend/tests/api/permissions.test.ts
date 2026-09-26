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

/**
 * Matriz de permissões — o que de fato protege os dados.
 *
 * O menu e o guard de rota do frontend rodam no navegador e podem ser
 * contornados; estes testes chamam a API direto, como faria quem contornou.
 */

let app: FastifyInstance;
let admin: TestUser;
let employee: TestUser;
let ids: { client: string; contract: string; invoice: string; payment: string };

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  admin = await createUser(app, { role: 'ADMIN' });
  employee = await createUser(app, { role: 'EMPLOYEE' });

  const client = await apiCreateClient(app, admin.token);
  const contract = await apiCreateContract(app, admin.token, client.id, {
    endDate: isoDaysFromToday(60),
  });
  const invoice = await apiCreateInvoice(app, admin.token, client.id, { amount: '500.00' });

  await request(app, 'POST', `/api/invoices/${invoice.id}/payment`, admin.token, {
    amount: '100.00',
    paymentDate: isoToday(),
    paymentMethod: 'PIX',
  });
  const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });

  ids = { client: client.id, contract: contract.id, invoice: invoice.id, payment: payment.id };
});

/** Rotas exclusivas do administrador, com um corpo que o admin conseguiria usar. */
function adminOnlyRoutes() {
  return [
    ['PATCH', `/api/clients/${ids.client}/status`, { status: 'INACTIVE' }],
    ['DELETE', `/api/clients/${ids.client}`, undefined],
    ['PATCH', `/api/contracts/${ids.contract}/status`, { status: 'CANCELLED' }],
    ['POST', `/api/contracts/${ids.contract}/renew`, { endDate: isoDaysFromToday(400) }],
    ['DELETE', `/api/contracts/${ids.contract}`, undefined],
    ['PATCH', `/api/invoices/${ids.invoice}/status`, { status: 'CANCELLED' }],
    ['DELETE', `/api/invoices/${ids.invoice}/payments/${ids.payment}`, undefined],
    ['DELETE', `/api/invoices/${ids.invoice}`, undefined],
    ['GET', '/api/finance/overview', undefined],
    ['GET', '/api/finance/entries', undefined],
    ['GET', '/api/finance/export', undefined],
  ] as const;
}

describe('REGRA: funcionário não acessa endpoints administrativos', () => {
  it('toda rota administrativa responde 403 ao funcionário', async () => {
    for (const [method, url, payload] of adminOnlyRoutes()) {
      const response = await request(app, method, url, employee.token, payload);

      expect(response.statusCode, `${method} ${url}`).toBe(403);
      expect(body(response).error).toMatchObject({
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para acessar este recurso.',
      });
    }
  });

  it('as tentativas do funcionário não alteram nada no banco', async () => {
    for (const [method, url, payload] of adminOnlyRoutes()) {
      await request(app, method, url, employee.token, payload);
    }

    const [client, contract, invoice, payments] = await Promise.all([
      prisma.client.findUnique({ where: { id: ids.client } }),
      prisma.contract.findUnique({ where: { id: ids.contract } }),
      prisma.invoice.findUnique({ where: { id: ids.invoice } }),
      prisma.payment.count(),
    ]);

    expect(client?.status).toBe('ACTIVE');
    expect(contract?.status).toBe('ACTIVE');
    expect(invoice?.status).toBe('PENDING');
    expect(payments).toBe(1);
  });

  it('o 403 vem antes da validação: corpo inválido não revela o formato esperado', async () => {
    const response = await request(
      app,
      'PATCH',
      `/api/clients/${ids.client}/status`,
      employee.token,
      { status: 'QUALQUER' },
    );

    expect(response.statusCode).toBe(403);
  });

  it('um token com role ADMIN forjada não eleva o funcionário', async () => {
    // Mesmo segredo, payload adulterado: o perfil que vale é o do banco.
    const tampered = app.jwt.sign({
      sub: employee.id,
      name: employee.name,
      email: employee.email,
      role: 'ADMIN',
    });

    const response = await request(app, 'GET', '/api/finance/overview', tampered);

    expect(response.statusCode).toBe(403);
  });

  it('o administrador acessa as mesmas rotas', async () => {
    const overview = await request(app, 'GET', '/api/finance/overview', admin.token);
    const status = await request(app, 'PATCH', `/api/contracts/${ids.contract}/status`, admin.token, {
      status: 'CLOSED',
    });

    expect(overview.statusCode).toBe(200);
    expect(status.statusCode).toBe(200);
  });
});

describe('o que o funcionário PODE fazer', () => {
  it('lê clientes, contratos, faturas, pagamentos e painel', async () => {
    const urls = [
      '/api/dashboard',
      '/api/clients',
      `/api/clients/${ids.client}`,
      `/api/clients/${ids.client}/history`,
      `/api/clients/${ids.client}/invoices`,
      '/api/contracts',
      `/api/contracts/${ids.contract}`,
      `/api/contracts/${ids.contract}/invoices`,
      '/api/contracts/next-number',
      '/api/invoices',
      `/api/invoices/${ids.invoice}`,
      `/api/invoices/${ids.invoice}/history`,
      `/api/invoices/${ids.invoice}/payments`,
      '/api/invoices/next-number',
      '/api/payments',
      `/api/payments/${ids.payment}`,
    ];

    for (const url of urls) {
      const response = await request(app, 'GET', url, employee.token);
      expect(response.statusCode, url).toBe(200);
    }
  });

  it('registra pagamento', async () => {
    const response = await request(app, 'POST', `/api/invoices/${ids.invoice}/payment`, employee.token, {
      amount: '50.00',
      paymentDate: isoToday(),
      paymentMethod: 'CASH',
    });

    expect(response.statusCode).toBe(201);
  });
});

describe('sem autenticação', () => {
  it('toda rota de negócio exige token (401)', async () => {
    const routes = [
      ...adminOnlyRoutes(),
      ['GET', '/api/dashboard', undefined],
      ['GET', '/api/clients', undefined],
      ['POST', '/api/clients', { name: 'X', cpfCnpj: '52998224725' }],
      ['PUT', `/api/clients/${ids.client}`, { phone: '11988887777' }],
      ['GET', '/api/contracts', undefined],
      ['POST', '/api/contracts', {}],
      ['GET', '/api/invoices', undefined],
      ['POST', '/api/invoices', {}],
      ['POST', `/api/invoices/${ids.invoice}/payment`, {}],
      ['GET', '/api/payments', undefined],
    ] as const;

    for (const [method, url, payload] of routes) {
      const response = await request(app, method, url, null, payload);
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('funcionário desativado perde acesso até às rotas de leitura', async () => {
    await prisma.user.update({ where: { id: employee.id }, data: { active: false } });

    const response = await request(app, 'GET', '/api/clients', employee.token);

    expect(response.statusCode).toBe(403);
    expect(body(response).error.message).toMatch(/desativado/);
  });
});
