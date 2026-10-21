import { deflateSync } from 'node:zlib';

import type { FastifyInstance } from 'fastify';
import { PDFDocument } from 'pdf-lib';
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

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  admin = await createUser(app, { role: 'ADMIN' });
  employee = await createUser(app, { role: 'EMPLOYEE' });
  clientId = (
    await apiCreateClient(app, admin.token, {
      name: 'Comercial Exemplo Ltda',
      street: 'R Exemplo Teste',
      number: '100',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
    })
  ).id;
});

async function pdfOf(response: { rawPayload: Buffer }) {
  return PDFDocument.load(response.rawPayload);
}

describe('GET /api/invoices/:id/pdf', () => {
  it('sem login: 401', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId);

    const response = await request(app, 'GET', `/api/invoices/${invoice.id}/pdf`, null);

    expect(response.statusCode).toBe(401);
  });

  it('funcionário baixa o PDF: arquivo de uma página com nome Fatura_<número>.pdf', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId, { number: 'FAT-2026-00009' });

    const response = await request(app, 'GET', `/api/invoices/${invoice.id}/pdf`, employee.token);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="Fatura_FAT-2026-00009.pdf"',
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const pdf = await pdfOf(response);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe('Fatura FAT-2026-00009');
  });

  it('disposition=inline abre no navegador; valor inválido é recusado', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId);

    const inline = await request(
      app,
      'GET',
      `/api/invoices/${invoice.id}/pdf?disposition=inline`,
      admin.token,
    );
    expect(inline.statusCode).toBe(200);
    expect(inline.headers['content-disposition']).toMatch(/^inline; filename="Fatura_/);

    const invalid = await request(
      app,
      'GET',
      `/api/invoices/${invoice.id}/pdf?disposition=qualquer`,
      admin.token,
    );
    expect(invalid.statusCode).toBe(422);
  });

  it('fatura inexistente: 404 em JSON, sem arquivo', async () => {
    const response = await request(app, 'GET', '/api/invoices/nao-existe/pdf', admin.token);

    expect(response.statusCode).toBe(404);
    expect(body(response).error.message).toBe('Fatura não encontrada.');
  });

  it('gerar o PDF não altera a fatura e fica registrado na auditoria', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId, {
      dueDate: isoDaysFromToday(5),
    });
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });

    await request(app, 'GET', `/api/invoices/${invoice.id}/pdf`, employee.token);
    await request(app, 'GET', `/api/invoices/${invoice.id}/pdf?disposition=inline`, employee.token);
    await request(
      app,
      'GET',
      `/api/invoices/${invoice.id}/pdf?disposition=inline&purpose=print`,
      employee.token,
    );

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe(before.status);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(await prisma.invoiceHistory.count({ where: { invoiceId: invoice.id } })).toBe(1);

    const audit = await prisma.auditLog.findMany({
      where: { action: 'EXPORT', entity: 'INVOICE', entityId: invoice.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit).toHaveLength(3);
    expect(audit[0]).toMatchObject({ userId: employee.id, entityLabel: invoice.number });
    expect(audit.map((entry) => (entry.metadata as { modo: string }).modo)).toEqual([
      'baixar',
      'abrir',
      'imprimir',
    ]);
  });

  it('gera para fatura paga, vencida e cancelada', async () => {
    const paid = await apiCreateInvoice(app, admin.token, clientId, { amount: '405.25' });
    await request(app, 'POST', `/api/invoices/${paid.id}/payments`, admin.token, {
      amount: '405.25',
      paymentDate: isoToday(),
      paymentMethod: 'PIX',
    });

    const overdue = await apiCreateInvoice(app, admin.token, clientId, {
      issueDate: isoDaysFromToday(-40),
      dueDate: isoDaysFromToday(-10),
    });

    const cancelled = await apiCreateInvoice(app, admin.token, clientId);
    await request(app, 'PATCH', `/api/invoices/${cancelled.id}/status`, admin.token, {
      status: 'CANCELLED',
    });

    for (const invoice of [paid, overdue, cancelled]) {
      const response = await request(app, 'GET', `/api/invoices/${invoice.id}/pdf`, admin.token);
      expect(response.statusCode).toBe(200);
      expect((await pdfOf(response)).getPageCount()).toBe(1);
    }

    // A situação continua a mesma depois de gerar os documentos.
    const statuses = await prisma.invoice.findMany({
      where: { id: { in: [paid.id, overdue.id, cancelled.id] } },
      select: { id: true, status: true },
    });
    expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({
      [paid.id]: 'PAID',
      [overdue.id]: 'PENDING',
      [cancelled.id]: 'CANCELLED',
    });
  });
});

/** Só o cabeçalho de um PNG (assinatura + IHDR): o bastante para as dimensões. */
function pngHeaderDataUrl(width: number, height: number): string {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8; // profundidade de cor
  bytes[25] = 6; // RGBA
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

/** CRC-32 dos blocos do PNG (o mesmo polinômio do zlib). */
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * PNG VÁLIDO de cor chapada: grande em pixels, pequeno em bytes (comprime
 * quase tudo) — o caso que o limite de dimensões existe para barrar.
 */
function flatPngDataUrl(width: number, height: number): string {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profundidade de cor
  ihdr[9] = 2; // RGB

  // Cada linha: byte de filtro 0 + 3 bytes por pixel, tudo zero (preto).
  const raw = Buffer.alloc(height * (1 + width * 3));

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  return `data:image/png;base64,${png.toString('base64')}`;
}

/** O PDF tem alguma imagem embutida? (o dicionário de imagem nunca é comprimido) */
function hasEmbeddedImage(response: { rawPayload: Buffer }): boolean {
  return response.rawPayload.toString('latin1').includes('/Subtype /Image');
}

describe('logo grande demais', () => {
  it('PNG acima de 2000 px é recusado no envio, com as dimensões na mensagem', async () => {
    const response = await request(app, 'PUT', '/api/settings/appearance', admin.token, {
      logo: pngHeaderDataUrl(8000, 8000),
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.stringify(body(response))).toContain('8000 × 8000 px');
  });

  it('PNG com outro bloco antes do IHDR é recusado: não dá para esconder o tamanho', async () => {
    const bytes = Buffer.from(pngHeaderDataUrl(100, 100).split(',')[1] ?? '', 'base64');
    bytes.write('teXt', 12, 'ascii');

    const response = await request(app, 'PUT', '/api/settings/appearance', admin.token, {
      logo: `data:image/png;base64,${bytes.toString('base64')}`,
    });

    expect(response.statusCode).toBe(422);
    expect(JSON.stringify(body(response))).toContain('não é um PNG válido');
  });

  it('logo dentro do limite entra no PDF; PNG grande gravado antes do limite não', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId);
    const setLogo = (logo: string) =>
      prisma.settings.upsert({
        where: { id: 'singleton' },
        update: { logo },
        create: { id: 'singleton', logo },
      });

    await setLogo(flatPngDataUrl(400, 120));
    const small = await request(app, 'GET', `/api/invoices/${invoice.id}/pdf`, admin.token);
    expect(small.statusCode).toBe(200);
    expect(hasEmbeddedImage(small)).toBe(true);

    // Gravado direto no banco, como um logo enviado antes do limite existir.
    await setLogo(flatPngDataUrl(2100, 2100));
    const large = await request(app, 'GET', `/api/invoices/${invoice.id}/pdf`, admin.token);
    expect(large.statusCode).toBe(200);
    expect((await pdfOf(large)).getPageCount()).toBe(1);
    // Sem decodificar o PNG: a caixa do logo leva o nome da empresa.
    expect(hasEmbeddedImage(large)).toBe(false);
  });
});

describe('observação da fatura e forma de pagamento', () => {
  it('a observação é gravada, devolvida e editada com registro no histórico', async () => {
    const invoice = await apiCreateInvoice(app, admin.token, clientId, {
      notes: 'Pagamento até o vencimento.',
    });

    const created = body(await request(app, 'GET', `/api/invoices/${invoice.id}`, admin.token));
    expect(created.data.notes).toBe('Pagamento até o vencimento.');

    await request(app, 'PUT', `/api/invoices/${invoice.id}`, admin.token, { notes: '' });

    const updated = body(await request(app, 'GET', `/api/invoices/${invoice.id}`, admin.token));
    expect(updated.data.notes).toBeNull();

    const history = body(
      await request(app, 'GET', `/api/invoices/${invoice.id}/history`, admin.token),
    ).data.items;
    expect(history).toContainEqual(
      expect.objectContaining({ field: 'notes', fieldLabel: 'Observação' }),
    );
  });

  it('observação acima de 500 caracteres é recusada', async () => {
    const response = await request(app, 'POST', '/api/invoices', admin.token, {
      clientId,
      number: 'FAT-2026-00500',
      amount: '100.00',
      issueDate: isoToday(),
      dueDate: isoDaysFromToday(10),
      notes: 'x'.repeat(501),
    });

    expect(response.statusCode).toBe(422);
  });

  it('dados da empresa que saem na fatura podem ser apagados (vazio ou null)', async () => {
    const company = (overrides: Record<string, unknown>) =>
      request(app, 'PUT', '/api/settings/company', admin.token, {
        companyName: 'Escritório Modelo Contabilidade',
        ...overrides,
      });

    await company({
      companyCnpj: '11.222.333/0001-81',
      companyStreet: 'Av. das Nações',
      companyComplement: 'Sala 12',
      invoicePaymentInstructions: 'PIX CNPJ 11222333000181',
    });

    // Campo ausente mantém; "" e null apagam.
    expect(
      (await company({ companyComplement: '', companyCnpj: null, invoicePaymentInstructions: null }))
        .statusCode,
    ).toBe(200);

    const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(settings).toMatchObject({
      companyStreet: 'Av. das Nações',
      companyComplement: null,
      companyCnpj: null,
      invoicePaymentInstructions: null,
    });
  });

  it('a forma de pagamento é salva em Configurações e pode ser apagada', async () => {
    const save = (value: string) =>
      request(app, 'PUT', '/api/settings/company', admin.token, {
        companyName: 'Escritório Modelo Contabilidade',
        invoicePaymentInstructions: value,
      });

    expect((await save('PIX CNPJ 11222333000181')).statusCode).toBe(200);
    let settings = body(await request(app, 'GET', '/api/settings', employee.token)).data.settings;
    expect(settings.invoicePaymentInstructions).toBe('PIX CNPJ 11222333000181');

    expect((await save('')).statusCode).toBe(200);
    settings = body(await request(app, 'GET', '/api/settings', employee.token)).data.settings;
    expect(settings.invoicePaymentInstructions).toBeNull();
  });
});
