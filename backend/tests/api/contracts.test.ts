import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
  clientId = (await apiCreateClient(app, admin.token, { name: 'Cliente do Contrato' })).id;
});

function validContract(overrides: Record<string, unknown> = {}) {
  return {
    clientId,
    number: 'ct-2026-0001',
    serviceType: 'Contabilidade mensal',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    monthlyValue: '1500.00',
    dueDay: 10,
    ...overrides,
  };
}

describe('cadastro de contrato', () => {
  it('funcionário cadastra; número em maiúsculas e valores normalizados', async () => {
    const response = await request(app, 'POST', '/api/contracts', employee.token, validContract());

    expect(response.statusCode).toBe(201);
    expect(body(response).data).toMatchObject({
      number: 'CT-2026-0001',
      monthlyValue: '1500.00',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'ACTIVE',
      client: { id: clientId, name: 'Cliente do Contrato' },
    });
  });

  it('aceita prazo indeterminado (sem término)', async () => {
    const response = await request(
      app,
      'POST',
      '/api/contracts',
      admin.token,
      validContract({ endDate: null }),
    );

    expect(response.statusCode).toBe(201);
    expect(body(response).data.endDate).toBeNull();
  });

  describe('REGRA: contrato sem cliente', () => {
    it('recusa sem clientId (422 no campo clientId)', async () => {
      const { clientId: _omit, ...withoutClient } = validContract();

      const response = await request(app, 'POST', '/api/contracts', admin.token, withoutClient);

      expect(response.statusCode).toBe(422);
      expect(body(response).error.issues[0]).toMatchObject({
        field: 'clientId',
        message: 'Selecione o cliente do contrato.',
      });
    });

    it('recusa clientId vazio ou só com espaços', async () => {
      for (const blank of ['', '   ']) {
        const response = await request(
          app,
          'POST',
          '/api/contracts',
          admin.token,
          validContract({ clientId: blank }),
        );
        expect(response.statusCode).toBe(422);
      }
    });

    it('recusa cliente inexistente com 404 e mensagem de negócio', async () => {
      const response = await request(
        app,
        'POST',
        '/api/contracts',
        admin.token,
        validContract({ clientId: 'cliente-que-nao-existe' }),
      );

      expect(response.statusCode).toBe(404);
      expect(body(response).error.message).toMatch(/Cliente não encontrado/);
    });

    it('recusa trocar o cliente de um contrato por um inexistente', async () => {
      const contract = await apiCreateContract(app, admin.token, clientId);

      const response = await request(app, 'PUT', `/api/contracts/${contract.id}`, admin.token, {
        clientId: 'cliente-que-nao-existe',
      });

      expect(response.statusCode).toBe(404);
    });

    it('recusa clientId nulo na edição (não dá para desvincular o cliente)', async () => {
      const contract = await apiCreateContract(app, admin.token, clientId);

      const response = await request(app, 'PUT', `/api/contracts/${contract.id}`, admin.token, {
        clientId: null,
      });

      expect(response.statusCode).toBe(422);
    });
  });

  it('recusa número duplicado, sem diferenciar maiúsculas', async () => {
    await request(app, 'POST', '/api/contracts', admin.token, validContract());

    const response = await request(
      app,
      'POST',
      '/api/contracts',
      admin.token,
      validContract({ number: 'CT-2026-0001' }),
    );

    expect(response.statusCode).toBe(409);
    expect(body(response).error.message).toContain('Cliente do Contrato');
  });

  it('recusa valores e datas inválidos', async () => {
    const invalids = [
      { monthlyValue: '0' },
      { monthlyValue: '-100' },
      { monthlyValue: '99999999999' },
      { dueDay: 0 },
      { dueDay: 32 },
      { startDate: '2026-02-30' },
      { endDate: '2025-12-31' },
      { serviceType: 'x' },
    ];

    for (const change of invalids) {
      const response = await request(
        app,
        'POST',
        '/api/contracts',
        admin.token,
        validContract(change),
      );
      expect(response.statusCode, JSON.stringify(change)).toBe(422);
    }
  });

  it('sugere o próximo número livre do ano', async () => {
    const year = isoToday().slice(0, 4);
    await request(
      app,
      'POST',
      '/api/contracts',
      admin.token,
      validContract({ number: `CT-${year}-0007` }),
    );

    const response = await request(app, 'GET', '/api/contracts/next-number', employee.token);

    expect(body(response).data.number).toBe(`CT-${year}-0008`);
  });
});

describe('edição de contrato', () => {
  it('valida as datas contra o valor já gravado', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId, {
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    });

    const response = await request(app, 'PUT', `/api/contracts/${contract.id}`, admin.token, {
      startDate: '2026-07-01',
    });

    expect(response.statusCode).toBe(422);
    expect(body(response).error.issues[0].field).toBe('endDate');
  });

  it('permite apagar as observações', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId, { notes: 'Antiga' });

    const response = await request(app, 'PUT', `/api/contracts/${contract.id}`, admin.token, {
      notes: '',
    });

    expect(body(response).data.notes).toBeNull();
  });

  it('funcionário edita dados, mas não a situação', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId);

    const allowed = await request(app, 'PUT', `/api/contracts/${contract.id}`, employee.token, {
      serviceType: 'Folha de pagamento',
      status: 'ACTIVE',
    });
    const blocked = await request(app, 'PUT', `/api/contracts/${contract.id}`, employee.token, {
      status: 'CANCELLED',
    });

    expect(allowed.statusCode).toBe(200);
    expect(blocked.statusCode).toBe(403);
  });
});

describe('situação, renovação e exclusão', () => {
  it('encerrar antecipa o término para hoje', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId, {
      endDate: isoDaysFromToday(200),
    });

    const response = await request(app, 'PATCH', `/api/contracts/${contract.id}/status`, admin.token, {
      status: 'CLOSED',
    });

    expect(response.statusCode).toBe(200);
    expect(body(response).data).toMatchObject({ status: 'CLOSED', endDate: isoToday() });
  });

  it('mesma situação devolve 409', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId);

    const response = await request(app, 'PATCH', `/api/contracts/${contract.id}/status`, admin.token, {
      status: 'ACTIVE',
    });

    expect(response.statusCode).toBe(409);
  });

  it('renova estendendo o prazo e reajustando o valor', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId, {
      endDate: '2026-12-31',
      monthlyValue: '1000.00',
    });

    const response = await request(app, 'POST', `/api/contracts/${contract.id}/renew`, admin.token, {
      endDate: '2027-12-31',
      monthlyValue: '1100.00',
    });

    expect(response.statusCode).toBe(200);
    expect(body(response).data).toMatchObject({
      endDate: '2027-12-31',
      monthlyValue: '1100.00',
      status: 'ACTIVE',
    });
  });

  it('não renova para data anterior, nem contrato cancelado ou sem término', async () => {
    const dated = await apiCreateContract(app, admin.token, clientId, { endDate: '2026-12-31' });
    const open = await apiCreateContract(app, admin.token, clientId, { endDate: null });
    const cancelled = await apiCreateContract(app, admin.token, clientId);
    await request(app, 'PATCH', `/api/contracts/${cancelled.id}/status`, admin.token, {
      status: 'CANCELLED',
    });

    const earlier = await request(app, 'POST', `/api/contracts/${dated.id}/renew`, admin.token, {
      endDate: '2026-06-30',
    });
    const noEnd = await request(app, 'POST', `/api/contracts/${open.id}/renew`, admin.token, {
      endDate: '2030-01-01',
    });
    const wasCancelled = await request(
      app,
      'POST',
      `/api/contracts/${cancelled.id}/renew`,
      admin.token,
      { endDate: '2030-01-01' },
    );

    expect(earlier.statusCode).toBe(422);
    expect(noEnd.statusCode).toBe(409);
    expect(wasCancelled.statusCode).toBe(409);
  });

  it('não exclui contrato com faturas (o banco deixaria as faturas órfãs)', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId);
    await apiCreateInvoice(app, admin.token, clientId, { contractId: contract.id });

    const response = await request(app, 'DELETE', `/api/contracts/${contract.id}`, admin.token);

    expect(response.statusCode).toBe(409);
  });

  it('exclui contrato sem faturas', async () => {
    const contract = await apiCreateContract(app, admin.token, clientId);

    const response = await request(app, 'DELETE', `/api/contracts/${contract.id}`, admin.token);

    expect(response.statusCode).toBe(204);
  });
});

describe('listagem', () => {
  it('filtra contratos vencendo nos próximos N dias, fora os encerrados', async () => {
    await apiCreateContract(app, admin.token, clientId, { endDate: isoDaysFromToday(10) });
    await apiCreateContract(app, admin.token, clientId, { endDate: isoDaysFromToday(90) });
    await apiCreateContract(app, admin.token, clientId, { endDate: null });

    const response = await request(app, 'GET', '/api/contracts?expiringInDays=30', employee.token);

    expect(body(response).data.total).toBe(1);
  });

  it('busca por nome do cliente', async () => {
    await apiCreateContract(app, admin.token, clientId);

    const response = await request(app, 'GET', '/api/contracts?search=do%20contrato', employee.token);

    expect(body(response).data.total).toBe(1);
  });
});
