import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  apiCreateClient,
  apiCreateContract,
  apiCreateInvoice,
  body,
  createTestApp,
  createUser,
  makeCnpj,
  makeCpf,
  request,
  type TestUser,
} from '../helpers.js';

let app: FastifyInstance;
let admin: TestUser;
let employee: TestUser;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  admin = await createUser(app, { role: 'ADMIN' });
  employee = await createUser(app, { role: 'EMPLOYEE' });
});

const CPF = makeCpf(123456789);
const CPF_MASKED = CPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const CNPJ = makeCnpj(11222333);

describe('cadastro de cliente', () => {
  it('cadastra com documento mascarado e grava só dígitos', async () => {
    const response = await request(app, 'POST', '/api/clients', employee.token, {
      name: '  Padaria Pão Quente Ltda  ',
      cpfCnpj: CPF_MASKED,
      email: 'CONTATO@Padaria.com.br',
      phone: '(11) 3333-4444',
      zipCode: '01310-100',
      state: 'sp',
    });

    expect(response.statusCode).toBe(201);
    expect(body(response).data).toMatchObject({
      name: 'Padaria Pão Quente Ltda',
      cpfCnpj: CPF,
      email: 'contato@padaria.com.br',
      phone: '1133334444',
      zipCode: '01310100',
      state: 'SP',
      status: 'ACTIVE',
    });
  });

  it('aceita CNPJ', async () => {
    const response = await request(app, 'POST', '/api/clients', admin.token, {
      name: 'Empresa X',
      cpfCnpj: CNPJ,
    });

    expect(response.statusCode).toBe(201);
  });

  it('registra CREATED no histórico, com o autor', async () => {
    const client = await apiCreateClient(app, employee.token);

    const response = await request(app, 'GET', `/api/clients/${client.id}/history`, admin.token);

    expect(body(response).data.items).toEqual([
      expect.objectContaining({ action: 'CREATED', userName: employee.name }),
    ]);
  });

  describe('REGRA: CPF/CNPJ duplicado', () => {
    it('recusa o mesmo CPF com 409 e diz quem já o usa', async () => {
      await apiCreateClient(app, admin.token, { name: 'Primeiro Cliente', cpfCnpj: CPF });

      const response = await request(app, 'POST', '/api/clients', admin.token, {
        name: 'Segundo Cliente',
        cpfCnpj: CPF,
      });

      expect(response.statusCode).toBe(409);
      expect(body(response).error.code).toBe('CONFLICT');
      expect(body(response).error.message).toContain('Primeiro Cliente');
    });

    it('a máscara não fura a unicidade', async () => {
      await apiCreateClient(app, admin.token, { cpfCnpj: CPF });

      const response = await request(app, 'POST', '/api/clients', admin.token, {
        name: 'Outro',
        cpfCnpj: CPF_MASKED,
      });

      expect(response.statusCode).toBe(409);
    });

    it('recusa editar um cliente para o documento de outro', async () => {
      await apiCreateClient(app, admin.token, { name: 'Dono do CPF', cpfCnpj: CPF });
      const other = await apiCreateClient(app, admin.token);

      const response = await request(app, 'PUT', `/api/clients/${other.id}`, admin.token, {
        cpfCnpj: CPF,
      });

      expect(response.statusCode).toBe(409);
      expect(body(response).error.message).toContain('Dono do CPF');
    });

    it('cadastros simultâneos com o mesmo documento: só um entra', async () => {
      const responses = await Promise.all(
        [1, 2, 3].map((index) =>
          request(app, 'POST', '/api/clients', admin.token, { name: `Corrida ${index}`, cpfCnpj: CPF }),
        ),
      );

      const statuses = responses.map((response) => response.statusCode).sort();
      expect(statuses).toEqual([201, 409, 409]);
    });

    it('salvar o próprio documento sem mudança não é duplicidade', async () => {
      const client = await apiCreateClient(app, admin.token, { cpfCnpj: CPF });

      const response = await request(app, 'PUT', `/api/clients/${client.id}`, admin.token, {
        cpfCnpj: CPF_MASKED,
        name: 'Nome Novo',
      });

      expect(response.statusCode).toBe(200);
    });
  });

  it('recusa documento inválido', async () => {
    const response = await request(app, 'POST', '/api/clients', admin.token, {
      name: 'Cliente',
      cpfCnpj: '111.111.111-11',
    });

    expect(response.statusCode).toBe(422);
    expect(body(response).error.issues[0].field).toBe('cpfCnpj');
  });

  it('recusa sem nome e sem documento, apontando os dois campos', async () => {
    const response = await request(app, 'POST', '/api/clients', admin.token, {});

    expect(response.statusCode).toBe(422);
    const fields = body(response).error.issues.map((issue: { field: string }) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'cpfCnpj']));
  });

  it('ignora campos desconhecidos em vez de gravá-los', async () => {
    const response = await request(app, 'POST', '/api/clients', admin.token, {
      name: 'Cliente',
      cpfCnpj: CPF,
      id: 'id-forjado',
      createdAt: '2000-01-01T00:00:00.000Z',
    });

    expect(response.statusCode).toBe(201);
    expect(body(response).data.id).not.toBe('id-forjado');
    expect(body(response).data.createdAt).not.toContain('2000');
  });
});

describe('listagem e detalhe', () => {
  it('pagina, filtra por situação e busca por nome ou documento mascarado', async () => {
    await apiCreateClient(app, admin.token, { name: 'Alfa Comércio', cpfCnpj: CPF });
    await apiCreateClient(app, admin.token, { name: 'Beta Serviços' });
    const gamma = await apiCreateClient(app, admin.token, { name: 'Gama Indústria' });
    await request(app, 'PATCH', `/api/clients/${gamma.id}/status`, admin.token, {
      status: 'INACTIVE',
    });

    const page = body(await request(app, 'GET', '/api/clients?pageSize=2', employee.token)).data;
    expect(page).toMatchObject({ total: 3, totalPages: 2, pageSize: 2 });
    expect(page.items).toHaveLength(2);

    const inactive = body(await request(app, 'GET', '/api/clients?status=INACTIVE', employee.token))
      .data;
    expect(inactive.items.map((item: { name: string }) => item.name)).toEqual(['Gama Indústria']);

    const byName = body(await request(app, 'GET', '/api/clients?search=alfa', employee.token)).data;
    expect(byName.total).toBe(1);

    const byDocument = body(
      await request(app, 'GET', `/api/clients?search=${encodeURIComponent(CPF_MASKED.slice(0, 7))}`, employee.token),
    ).data;
    expect(byDocument.items.map((item: { name: string }) => item.name)).toContain('Alfa Comércio');
  });

  it('recusa pageSize acima de 100', async () => {
    const response = await request(app, 'GET', '/api/clients?pageSize=1000', admin.token);
    expect(response.statusCode).toBe(422);
  });

  it('detalhe traz contratos e resumo financeiro', async () => {
    const client = await apiCreateClient(app, admin.token);
    await apiCreateContract(app, admin.token, client.id);
    await apiCreateInvoice(app, admin.token, client.id, { amount: '300.00' });

    const response = await request(app, 'GET', `/api/clients/${client.id}`, employee.token);

    expect(response.statusCode).toBe(200);
    const { data } = body(response);
    expect(data.contracts).toHaveLength(1);
    expect(data.summary.contracts).toEqual({ total: 1, active: 1 });
    expect(data.summary.invoices.total).toBe(1);
    expect(data.summary.amounts.invoiced).toBe('300.00');
  });

  it('cliente inexistente devolve 404', async () => {
    const response = await request(app, 'GET', '/api/clients/nao-existe', admin.token);

    expect(response.statusCode).toBe(404);
    expect(body(response).error.message).toBe('Cliente não encontrado.');
  });
});

describe('edição de cliente', () => {
  it('registra no histórico apenas os campos que mudaram', async () => {
    const client = await apiCreateClient(app, admin.token, { phone: '11988887777' });

    await request(app, 'PUT', `/api/clients/${client.id}`, admin.token, {
      name: client.name,
      phone: '11977776666',
    });

    const history = body(
      await request(app, 'GET', `/api/clients/${client.id}/history`, admin.token),
    ).data.items;

    const updates = history.filter((entry: { action: string }) => entry.action === 'UPDATED');
    expect(updates).toEqual([
      expect.objectContaining({ field: 'phone', oldValue: '11988887777', newValue: '11977776666' }),
    ]);
  });

  it('permite APAGAR um campo opcional enviando vazio', async () => {
    const client = await apiCreateClient(app, admin.token, {
      email: 'antigo@cliente.com.br',
      notes: 'Observação antiga',
    });

    const response = await request(app, 'PUT', `/api/clients/${client.id}`, admin.token, {
      email: '',
      notes: '',
    });

    expect(response.statusCode).toBe(200);
    expect(body(response).data).toMatchObject({ email: null, notes: null });
  });

  it('funcionário edita dados de contato', async () => {
    const client = await apiCreateClient(app, admin.token);

    const response = await request(app, 'PUT', `/api/clients/${client.id}`, employee.token, {
      phone: '(11) 3333-4444',
      city: 'Campinas',
    });

    expect(response.statusCode).toBe(200);
    expect(body(response).data).toMatchObject({ phone: '1133334444', city: 'Campinas' });
  });

  it('funcionário NÃO altera identidade fiscal nem situação', async () => {
    const client = await apiCreateClient(app, admin.token, { name: 'Nome Original' });

    for (const change of [{ name: 'Nome Trocado' }, { cpfCnpj: CNPJ }, { status: 'INACTIVE' }]) {
      const response = await request(app, 'PUT', `/api/clients/${client.id}`, employee.token, change);
      expect(response.statusCode).toBe(403);
    }

    const current = body(await request(app, 'GET', `/api/clients/${client.id}`, admin.token)).data;
    expect(current).toMatchObject({ name: 'Nome Original', status: 'ACTIVE' });
  });

  it('funcionário pode reenviar o formulário completo com nome e documento INALTERADOS', async () => {
    // O formulário de edição manda todos os campos, inclusive os que o
    // funcionário não pode mudar. Reenviar o mesmo valor não é alteração.
    const client = await apiCreateClient(app, admin.token, { name: 'Cliente Fixo', cpfCnpj: CPF });

    const response = await request(app, 'PUT', `/api/clients/${client.id}`, employee.token, {
      name: 'Cliente Fixo',
      cpfCnpj: CPF_MASKED,
      status: 'ACTIVE',
      phone: '11988887777',
    });

    expect(response.statusCode).toBe(200);
    expect(body(response).data.phone).toBe('11988887777');
  });
});

describe('situação e exclusão', () => {
  it('admin inativa e reativa, com evento próprio no histórico', async () => {
    const client = await apiCreateClient(app, admin.token);

    const off = await request(app, 'PATCH', `/api/clients/${client.id}/status`, admin.token, {
      status: 'INACTIVE',
    });
    const again = await request(app, 'PATCH', `/api/clients/${client.id}/status`, admin.token, {
      status: 'INACTIVE',
    });
    const on = await request(app, 'PATCH', `/api/clients/${client.id}/status`, admin.token, {
      status: 'ACTIVE',
    });

    expect(off.statusCode).toBe(200);
    expect(again.statusCode).toBe(409);
    expect(on.statusCode).toBe(200);

    const actions = body(
      await request(app, 'GET', `/api/clients/${client.id}/history`, admin.token),
    ).data.items.map((entry: { action: string }) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['CREATED', 'DEACTIVATED', 'ACTIVATED']));
  });

  it('exclui cliente sem vínculos', async () => {
    const client = await apiCreateClient(app, admin.token);

    const response = await request(app, 'DELETE', `/api/clients/${client.id}`, admin.token);

    expect(response.statusCode).toBe(204);
    expect((await request(app, 'GET', `/api/clients/${client.id}`, admin.token)).statusCode).toBe(404);
  });

  it('não exclui cliente com contrato ou fatura (histórico financeiro)', async () => {
    const client = await apiCreateClient(app, admin.token);
    await apiCreateContract(app, admin.token, client.id);
    await apiCreateInvoice(app, admin.token, client.id);

    const response = await request(app, 'DELETE', `/api/clients/${client.id}`, admin.token);

    expect(response.statusCode).toBe(409);
    expect(body(response).error.message).toMatch(/1 contrato\(s\) e 1 fatura\(s\)/);
  });
});
