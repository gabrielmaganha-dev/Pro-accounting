import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
  type PDFObject,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LOGO_PNG_BASE64 } from '../../src/documents/default-logo.js';
import { renderInvoicePdf, type InvoicePdfInput } from '../../src/documents/invoice-pdf.js';
import { invoicePdfFilename } from '../../src/services/invoice-pdf.service.js';

/** Os dados da fatura-modelo do escritório. */
function modelInput(): InvoicePdfInput {
  return {
    company: {
      name: 'Escritório Modelo Contabilidade',
      cnpj: '11222333000181',
      street: 'Av. das Nações',
      number: '1.000',
      complement: 'Sala 12',
      logo: { format: 'png', bytes: Buffer.from(DEFAULT_LOGO_PNG_BASE64, 'base64') },
      paymentInstructions: 'PIX CNPJ 11222333000181',
    },
    client: {
      name: 'Comercial Exemplo Ltda',
      cpfCnpj: '12345678000195',
      street: 'R Exemplo Teste',
      number: '100',
      complement: 'Sala 3',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
    },
    invoice: {
      number: '009-2026',
      issueDate: '2026-09-30',
      dueDate: '2026-10-10',
      service: 'Serviço de Contabilidade, Fiscal - comp. 09.2026',
      amount: '405.25',
      paidAmount: '0.00',
      outstanding: '405.25',
      notes: null,
      status: 'PENDING',
      lastPaymentDate: null,
    },
  };
}

/**
 * Texto desenhado na página, uma linha por chamada de desenho.
 *
 * O `pdf-lib` escreve cada texto como string hexadecimal nos códigos WinAnsi;
 * para o português eles coincidem com o latin1.
 */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(0).node.Contents();

  const resolve = (object: PDFObject | undefined) =>
    object instanceof PDFRef ? pdf.context.lookup(object) : object;

  const streams =
    contents instanceof PDFArray ? contents.asArray().map(resolve) : [resolve(contents)];

  let operators = '';
  for (const stream of streams) {
    if (stream instanceof PDFRawStream) {
      operators += Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
    }
  }

  return [...operators.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)]
    .map((match) => Buffer.from(match[1] ?? '', 'hex').toString('latin1'))
    .join('\n');
}

describe('fatura em PDF', () => {
  it('a cópia embutida do logo padrão é igual ao arquivo do frontend', () => {
    const frontendLogo = readFileSync(
      fileURLToPath(new URL('../../../frontend/src/assets/logo.png', import.meta.url)),
    );

    // Se este teste falhar, o logo padrão foi trocado sem regenerar a cópia:
    // rode `node scripts/sync-default-logo.mjs` na raiz do projeto.
    expect(Buffer.from(DEFAULT_LOGO_PNG_BASE64, 'base64').equals(frontendLogo)).toBe(true);
  });

  it('gera uma página A4 com os dados do modelo nos campos certos', async () => {
    const bytes = await renderInvoicePdf(modelInput());
    const pdf = await PDFDocument.load(bytes);

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(pdf.getTitle()).toBe('Fatura 009-2026');

    const text = await pdfText(bytes);

    // Cabeçalho
    expect(text).toContain('Escritório Modelo Contabilidade');
    expect(text).toContain('Av. das Nações, nº 1.000 - Sala 12');
    expect(text).toContain('11.222.333/0001-81');
    expect(text).toContain('FATURA DE SERVIÇOS');
    expect(text).toContain('Nº: 009-2026');
    expect(text).toContain('Emissão: 30/09/2026');

    // Destinatário em maiúsculas, documento e CEP mascarados como no modelo
    expect(text).toContain('COMERCIAL EXEMPLO LTDA');
    expect(text).toContain('12.345.678/0001-95');
    expect(text).toContain('R EXEMPLO TESTE N. 100 SALA 3');
    expect(text).toContain('CENTRO');
    expect(text).toContain('01.001-000');
    expect(text).toContain('SÃO PAULO');

    // Serviço, valores e faixa de pagamento
    expect(text).toContain('Serviço de Contabilidade, Fiscal - comp. 09.2026');
    expect(text).toContain('405,25');
    expect(text).toContain('10.10.2026');
    expect(text).toContain('PIX CNPJ 11222333000181');

    // Canhoto com o nome de quem emite
    expect(text).toContain('ESCRITÓRIO MODELO CONTABILIDADE');

    // Pendente em dia: a observação fica vazia, como no modelo
    expect(text).not.toMatch(/Fatura (paga|vencida|cancelada)/);
  });

  it('indica a situação no documento: paga, vencida com saldo e cancelada', async () => {
    const base = modelInput();

    const paid = await pdfText(
      await renderInvoicePdf({
        ...base,
        invoice: {
          ...base.invoice,
          status: 'PAID',
          paidAmount: '405.25',
          outstanding: '0.00',
          lastPaymentDate: '2026-10-08',
        },
      }),
    );
    expect(paid).toContain('Fatura paga em 08/10/2026.');
    expect(paid).toContain('PAGA');

    const overdue = await pdfText(
      await renderInvoicePdf({
        ...base,
        invoice: { ...base.invoice, status: 'OVERDUE', paidAmount: '100.00', outstanding: '305.25' },
      }),
    );
    expect(overdue).toContain('Fatura vencida em 10/10/2026.');
    expect(overdue).toContain('Saldo em aberto: R$ 305,25.');

    const cancelled = await pdfText(
      await renderInvoicePdf({ ...base, invoice: { ...base.invoice, status: 'CANCELLED' } }),
    );
    expect(cancelled).toContain('CANCELADA');
    expect(cancelled).toContain('sem valor de cobrança');
  });

  it('textos no limite dos campos continuam numa página só, sem erro', async () => {
    const base = modelInput();
    const long = 'Texto longo para testar o encaixe do campo. '.repeat(20);

    const bytes = await renderInvoicePdf({
      company: { ...base.company, name: 'E'.repeat(180), logo: null, paymentInstructions: 'P'.repeat(80) },
      client: { ...base.client, name: `${'Razão Social '.repeat(14)} 😀`, neighborhood: 'B'.repeat(120) },
      invoice: {
        ...base.invoice,
        number: 'FAT-2026-0000000000000000000001',
        service: long.slice(0, 255),
        notes: `${long}\n\n${long}`.slice(0, 500),
        amount: '9999999999.99',
      },
    });

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);

    const text = await pdfText(bytes);
    expect(text).toContain('9.999.999.999,99');
    // O emoji não existe na fonte do PDF: vira "?", em vez de derrubar a geração.
    expect(text).not.toContain('😀');
  });

  /**
   * O que o formulário aceita sai INTEIRO no PDF.
   *
   * O texto extraído traz uma linha por desenho; uma palavra nunca é partida
   * entre linhas (a quebra é nos espaços), então conferir as palavras basta. As
   * reticências que o gerador usa para cortar são o byte 0x85 do WinAnsi.
   */
  describe('nada do que o formulário aceita é cortado', () => {
    const ELLIPSIS = '\u0085';

    it('forma de pagamento com 71 e com 80 caracteres', async () => {
      const base = modelInput();

      for (const instructions of [
        'PIX CNPJ 11.222.333/0001-81 ou TED Banco do Brasil Ag 1234-5 CC 98765-4',
        'PIX CHAVE CNPJ 11.222.333/0001-81 OU TED BANCO DO BRASIL AGENCIA 1234-5 CC 9876',
      ]) {
        const text = await pdfText(
          await renderInvoicePdf({
            ...base,
            company: { ...base.company, paymentInstructions: instructions },
          }),
        );

        for (const word of instructions.split(' ')) expect(text).toContain(word);
        expect(text).not.toContain(ELLIPSIS);
      }
    });

    it('observação de várias linhas curtas, com a linha automática de atraso', async () => {
      const base = modelInput();
      const notes = [
        'Referente aos serviços de setembro.',
        'Pagamento via PIX.',
        'Multa de 2% após o vencimento.',
        'Juros de 1% ao mês.',
        'Dúvidas: (11) 3333-4444.',
        'Obrigado pela preferência.',
      ].join('\n');

      const text = await pdfText(
        await renderInvoicePdf({
          ...base,
          invoice: {
            ...base.invoice,
            status: 'OVERDUE',
            paidAmount: '100.00',
            outstanding: '305.25',
            notes,
          },
        }),
      );

      for (const word of notes.split(/\s+/)) expect(text).toContain(word);
      expect(text).toContain('Saldo em aberto: R$ 305,25.');
      expect(text).not.toContain(ELLIPSIS);
    });

    it('observação de 500 e descrição de 255 caracteres, cheias de quebras de linha', async () => {
      const base = modelInput();
      const notes = Array.from({ length: 25 }, (_, i) => `Linha ${i + 1} da obs.`)
        .join('\n')
        .slice(0, 500);
      const service = Array.from({ length: 24 }, (_, i) => `Item ${i + 1}`)
        .join('\n')
        .slice(0, 255);

      const text = await pdfText(
        await renderInvoicePdf({ ...base, invoice: { ...base.invoice, notes, service } }),
      );

      expect(text).toContain('Linha 25 da obs.');
      expect(text).toContain('Item 24');
      expect(text).not.toContain(ELLIPSIS);
    });

    it('razão social de 180 caracteres e endereço longo do cliente', async () => {
      const base = modelInput();
      const name = 'Empresa Brasileira de Serviços Contábeis Assessoria Fiscal e Tributária '
        .repeat(3)
        .slice(0, 180)
        .trim();
      const street = 'Avenida Presidente Juscelino Kubitschek de Oliveira Esquina com a Rua';

      const text = await pdfText(
        await renderInvoicePdf({
          ...base,
          client: { ...base.client, name, street, complement: 'Bloco B Sala 1203 Conjunto Comercial' },
        }),
      );

      for (const word of name.toLocaleUpperCase('pt-BR').split(' ')) expect(text).toContain(word);
      expect(text).toContain('KUBITSCHEK');
      expect(text).toContain('CONJUNTO');
      expect(text).not.toContain(ELLIPSIS);
    });
  });

  it('acento decomposto (a + til combinante) sai como "Ã", não como "?"', async () => {
    const base = modelInput();

    const text = await pdfText(
      await renderInvoicePdf({ ...base, client: { ...base.client, city: 'São Paulo' } }),
    );

    expect(text).toContain('SÃO PAULO');
  });

  it('logo corrompido não impede a fatura: o nome da empresa ocupa a caixa', async () => {
    const base = modelInput();

    const bytes = await renderInvoicePdf({
      ...base,
      company: { ...base.company, logo: { format: 'png', bytes: Buffer.from('não é png') } },
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('nome do arquivo: Fatura_<número>.pdf, sem caracteres que quebrem o cabeçalho', () => {
    expect(invoicePdfFilename('FAT-2026-00001')).toBe('Fatura_FAT-2026-00001.pdf');
    expect(invoicePdfFilename('009/2026 "x"')).toBe('Fatura_009-2026-x.pdf');
    expect(invoicePdfFilename('///')).toBe('Fatura_sem-numero.pdf');
  });
});
