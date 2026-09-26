import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { body, createTestApp, createUser, isoDaysFromToday, isoToday, request } from '../helpers.js';

/**
 * Fluxo completo: Cliente → Contrato → Fatura → Pagamento → Dashboard → Financeiro.
 *
 * Um único cenário, montado passo a passo pela API como a interface faria, e
 * conferido nas três visões que o consomem. O valor deste teste é a
 * COERÊNCIA: a ficha do cliente, o painel e o financeiro calculam os mesmos
 * números por caminhos diferentes (Prisma, SQL cru, agregações), e um erro de
 * derivação aparece aqui como divergência entre eles.
 *
 * Cenário (valores em R$):
 *   A  1.500  emitida hoje       paga: 1.000 PIX + 500 dinheiro  -> PAGA
 *   B    800  emitida há 40 dias vencida há 5, paga 300 boleto   -> ATRASADA, 500 em aberto
 *   C  1.200  emitida hoje       vence em 10 dias                -> PENDENTE
 *   D    999  emitida hoje       cancelada                       -> CANCELADA
 */

let app: FastifyInstance;
let adminToken: string;
let employeeToken: string;

const state: Record<string, string> = {};

beforeAll(async () => {
  app = await createTestApp();
  // Os usuários são criados aqui, e não em beforeEach, porque o setup global
  // trunca o banco antes de CADA teste — e este arquivo é um fluxo único.
});

afterAll(async () => {
  await app.close();
});

describe('fluxo integrado', () => {
  it('Cliente → Contrato → Fatura → Pagamento → Dashboard → Financeiro', async () => {
    adminToken = (await createUser(app, { role: 'ADMIN' })).token;
    employeeToken = (await createUser(app, { role: 'EMPLOYEE' })).token;

    // --- 1. Cliente ---------------------------------------------------------
    const client = await request(app, 'POST', '/api/clients', employeeToken, {
      name: 'Padaria Fluxo Completo Ltda',
      cpfCnpj: '11.222.333/0001-81',
      email: 'financeiro@padaria.com.br',
    });
    expect(client.statusCode).toBe(201);
    state.client = body(client).data.id;

    // --- 2. Contrato --------------------------------------------------------
    const contract = await request(app, 'POST', '/api/contracts', employeeToken, {
      clientId: state.client,
      number: 'CT-FLUXO-0001',
      serviceType: 'Contabilidade mensal',
      startDate: isoDaysFromToday(-60),
      endDate: isoDaysFromToday(20),
      monthlyValue: '1500.00',
      dueDay: 10,
    });
    expect(contract.statusCode).toBe(201);
    state.contract = body(contract).data.id;

    // --- 3. Faturas ---------------------------------------------------------
    async function issue(key: string, payload: Record<string, unknown>) {
      const response = await request(app, 'POST', '/api/invoices', employeeToken, {
        clientId: state.client,
        contractId: state.contract,
        issueDate: isoToday(),
        dueDate: isoDaysFromToday(10),
        ...payload,
      });
      expect(response.statusCode, key).toBe(201);
      state[key] = body(response).data.id;
    }

    await issue('A', { number: 'FAT-FLUXO-A', amount: '1500.00' });
    await issue('B', {
      number: 'FAT-FLUXO-B',
      amount: '800.00',
      issueDate: isoDaysFromToday(-40),
      dueDate: isoDaysFromToday(-5),
    });
    await issue('C', { number: 'FAT-FLUXO-C', amount: '1200.00' });
    await issue('D', { number: 'FAT-FLUXO-D', amount: '999.00', contractId: null });

    const cancel = await request(app, 'PATCH', `/api/invoices/${state.D}/status`, adminToken, {
      status: 'CANCELLED',
    });
    expect(cancel.statusCode).toBe(200);

    // --- 4. Pagamentos ------------------------------------------------------
    async function pay(key: string, amount: string, paymentMethod: string) {
      const response = await request(app, 'POST', `/api/invoices/${state[key]}/payment`, employeeToken, {
        amount,
        paymentDate: isoToday(),
        paymentMethod,
      });
      expect(response.statusCode, `${key} ${amount}`).toBe(201);
      return body(response).data;
    }

    expect((await pay('A', '1000.00', 'PIX')).status).toBe('PENDING');
    expect((await pay('A', '500.00', 'CASH')).status).toBe('PAID');
    expect(await pay('B', '300.00', 'BOLETO')).toMatchObject({
      status: 'OVERDUE',
      outstanding: '500.00',
    });

    // --- Ficha do cliente e do contrato ------------------------------------
    const clientDetail = body(await request(app, 'GET', `/api/clients/${state.client}`, employeeToken))
      .data;
    expect(clientDetail.summary.invoices).toEqual({
      total: 4,
      paid: 1,
      pending: 1,
      overdue: 1,
      cancelled: 1,
    });
    expect(clientDetail.summary.amounts).toEqual({
      invoiced: '3500.00',
      received: '1800.00',
      pending: '1200.00',
      overdue: '500.00',
    });

    const contractDetail = body(
      await request(app, 'GET', `/api/contracts/${state.contract}`, employeeToken),
    ).data;
    // D é avulsa (sem contrato): fica fora da ficha do contrato.
    expect(contractDetail.summary.invoices.total).toBe(3);
    expect(contractDetail.summary.amounts.invoiced).toBe('3500.00');

    // --- 5. Dashboard -------------------------------------------------------
    const dashboard = body(await request(app, 'GET', '/api/dashboard', employeeToken)).data;

    expect(dashboard.referenceDate).toBe(isoToday());
    expect(dashboard.cards.clients).toEqual({ total: 1, active: 1, inactive: 0 });
    expect(dashboard.cards.contracts).toMatchObject({ total: 1, active: 1, expiringSoon: 1 });
    expect(dashboard.cards.invoices).toEqual({
      total: 4,
      paid: 1,
      pending: 1,
      overdue: 1,
      cancelled: 1,
    });
    expect(dashboard.cards.amounts).toEqual({
      received: '1800.00',
      pending: '1200.00',
      overdue: '500.00',
    });

    // Os números do card e do gráfico precisam bater.
    const overdueSlice = dashboard.charts.invoicesByStatus.find(
      (slice: { status: string }) => slice.status === 'OVERDUE',
    );
    expect(overdueSlice).toMatchObject({ count: 1, amount: '800.00', outstanding: '500.00' });

    const currentMonth = dashboard.charts.monthlyRevenue.at(-1);
    expect(currentMonth).toMatchObject({ month: isoToday().slice(0, 7), total: '1800.00', paymentCount: 3 });
    expect(dashboard.charts.monthlyRevenue).toHaveLength(12);

    expect(dashboard.alerts.overdueInvoices.count).toBe(1);
    expect(dashboard.alerts.overdueInvoices.items[0]).toMatchObject({
      number: 'FAT-FLUXO-B',
      daysOverdue: 5,
    });
    expect(dashboard.alerts.expiringContracts.items[0]).toMatchObject({
      number: 'CT-FLUXO-0001',
      daysUntilExpiry: 20,
    });

    expect(dashboard.recentActivity.clients).toHaveLength(1);
    expect(dashboard.recentActivity.payments).toHaveLength(3);

    // --- 6. Financeiro ------------------------------------------------------
    const overview = body(
      await request(app, 'GET', '/api/finance/overview?period=month', adminToken),
    ).data;

    expect(overview.cards).toMatchObject({
      revenueThisMonth: '1800.00',
      received: '1800.00',
      // A e C emitidas neste mês; B é do mês passado e D está cancelada.
      invoiced: '2700.00',
      pending: '1200.00',
      overdue: '500.00',
      pendingCount: 1,
      overdueCount: 1,
    });
    // O recebido do painel e o do financeiro são o mesmo dinheiro.
    expect(overview.cards.received).toBe(dashboard.cards.amounts.received);

    const byMethod = Object.fromEntries(
      overview.receiptsByMethod.map((item: { method: string; total: string }) => [
        item.method,
        item.total,
      ]),
    );
    expect(byMethod).toEqual({ PIX: '1000.00', BOLETO: '300.00', CASH: '500.00' });

    const seriesTotalCents = overview.revenueSeries.reduce(
      (sum: number, point: { total: string }) => sum + Math.round(Number(point.total) * 100),
      0,
    );
    expect(seriesTotalCents).toBe(180_000);

    const entries = body(
      await request(app, 'GET', '/api/finance/entries?period=month', adminToken),
    ).data;
    expect(entries.items.map((item: { number: string }) => item.number).sort()).toEqual([
      'FAT-FLUXO-A',
      'FAT-FLUXO-C',
      'FAT-FLUXO-D',
    ]);

    const csv = await request(app, 'GET', '/api/finance/export?period=month&format=csv', adminToken);
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="financeiro-.*\.csv"/);
    expect(csv.body.startsWith('﻿')).toBe(true);
    expect(csv.body).toContain('Padaria Fluxo Completo Ltda;11222333000181;FAT-FLUXO-A');
    expect(csv.body).toContain('1500,00;1500,00;0,00');

    // O funcionário participou de todo o fluxo, mas não vê o consolidado.
    const forbidden = await request(app, 'GET', '/api/finance/overview', employeeToken);
    expect(forbidden.statusCode).toBe(403);

    // --- Estorno propaga para as três visões -------------------------------
    const payments = body(await request(app, 'GET', `/api/invoices/${state.A}/payments`, adminToken))
      .data;
    const cashPayment = payments.find((item: { paymentMethod: string }) => item.paymentMethod === 'CASH');
    const reversal = await request(
      app,
      'DELETE',
      `/api/invoices/${state.A}/payments/${cashPayment.id}`,
      adminToken,
    );
    expect(body(reversal).data.status).toBe('PENDING');

    const dashboardAfter = body(await request(app, 'GET', '/api/dashboard', adminToken)).data;
    const overviewAfter = body(
      await request(app, 'GET', '/api/finance/overview?period=month', adminToken),
    ).data;

    expect(dashboardAfter.cards.amounts).toEqual({
      received: '1300.00',
      pending: '1700.00',
      overdue: '500.00',
    });
    expect(overviewAfter.cards.received).toBe('1300.00');
    expect(overviewAfter.cards.pending).toBe('1700.00');
  });
});

describe('financeiro — exportação e períodos', () => {
  it('neutraliza fórmulas no CSV (injeção de fórmula em planilha)', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });

    const client = await request(app, 'POST', '/api/clients', admin.token, {
      name: '=HYPERLINK("http://malicioso.example","Clique")',
      cpfCnpj: '52998224725',
    });
    await request(app, 'POST', '/api/invoices', admin.token, {
      clientId: body(client).data.id,
      number: '+FAT-1',
      amount: '10.00',
      issueDate: isoToday(),
      dueDate: isoToday(),
    });

    const csv = await request(app, 'GET', '/api/finance/export?period=month', admin.token);
    const dataLine = csv.body.split('\r\n')[1] ?? '';
    const cells = dataLine.split(';');

    // Nenhuma célula pode começar com = + - @, que o Excel executaria.
    for (const cell of cells) {
      expect(cell.replace(/^"/, ''), cell).not.toMatch(/^[=+\-@]/);
    }
    expect(dataLine).toContain('HYPERLINK');
  });

  it('formatos ainda não implementados respondem 501', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });

    const response = await request(app, 'GET', '/api/finance/export?format=pdf', admin.token);

    expect(response.statusCode).toBe(501);
    expect(body(response).error.code).toBe('NOT_IMPLEMENTED');
  });

  it('período personalizado exige as duas datas, em ordem', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });

    const missing = await request(app, 'GET', '/api/finance/overview?period=custom&from=2026-01-01', admin.token);
    const inverted = await request(
      app,
      'GET',
      '/api/finance/overview?period=custom&from=2026-02-01&to=2026-01-01',
      admin.token,
    );
    const valid = await request(
      app,
      'GET',
      '/api/finance/overview?period=custom&from=2026-01-01&to=2026-12-31',
      admin.token,
    );

    expect(missing.statusCode).toBe(422);
    expect(inverted.statusCode).toBe(422);
    expect(valid.statusCode).toBe(200);
    expect(body(valid).data.granularity).toBe('month');
    expect(body(valid).data.revenueSeries).toHaveLength(12);
  });

  it('banco vazio: painel e financeiro respondem zerados, sem erro', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });

    const dashboard = await request(app, 'GET', '/api/dashboard', admin.token);
    const overview = await request(app, 'GET', '/api/finance/overview?period=year', admin.token);

    expect(dashboard.statusCode).toBe(200);
    expect(body(dashboard).data.cards.amounts).toEqual({
      received: '0.00',
      pending: '0.00',
      overdue: '0.00',
    });
    expect(overview.statusCode).toBe(200);
    expect(body(overview).data.cards.received).toBe('0.00');
  });
});
