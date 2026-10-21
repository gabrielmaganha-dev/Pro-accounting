import { prisma } from '../config/prisma.js';
import { DEFAULT_LOGO_PNG_BASE64 } from '../documents/default-logo.js';
import { renderInvoicePdf, type InvoiceLogo } from '../documents/invoice-pdf.js';
import { AppError } from '../utils/app-error.js';
import { today, utcToIsoDate } from '../utils/date.js';
import { LOGO_MAX_SIDE_PX, pngDimensions } from '../utils/image.js';
import { effectiveInvoiceStatus, fromCents, toCents } from '../utils/invoice-status.js';
import { getSettings } from './settings.service.js';

/**
 * Fatura em PDF a partir dos dados gravados.
 *
 * Só LÊ: gerar o documento não muda a situação da fatura, não registra
 * pagamento e não grava nada na fatura. O registro de quem emitiu fica na
 * trilha de auditoria, feito pelo controller.
 *
 * O documento sai sempre dos valores atuais da fatura. Não há cópia guardada
 * do PDF: uma fatura editada depois de emitida gera um PDF com os dados novos,
 * e a edição fica no histórico da fatura (quem, quando, de quê para quê).
 */

const DEFAULT_LOGO: InvoiceLogo = {
  format: 'png',
  bytes: Buffer.from(DEFAULT_LOGO_PNG_BASE64, 'base64'),
};

/** Formatos que o PDF embute. SVG e WEBP, aceitos em Configurações, não. */
const EMBEDDABLE_LOGO = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$/;

/**
 * Qual logo vai na fatura.
 *
 * Sem logo enviado, sai o padrão de fábrica — o mesmo que a interface mostra.
 * Com um logo em SVG ou WEBP, sai o NOME da empresa na caixa do logo: usar o
 * padrão nesse caso estamparia a marca errada na fatura de outro escritório.
 *
 * Um PNG acima de `LOGO_MAX_SIDE_PX` (enviado antes de o limite existir) também
 * cai no nome: o PDF decodifica o PNG inteiro, e um de 8000 px levaria segundos
 * e centenas de MB por fatura. O JPEG não passa por isso — entra no PDF como
 * veio, sem decodificar.
 */
function resolveLogo(logo: string | null): InvoiceLogo | null {
  if (logo === null) return DEFAULT_LOGO;

  const match = EMBEDDABLE_LOGO.exec(logo);
  if (!match || !match[2]) return null;

  const bytes = Buffer.from(match[2], 'base64');

  if (match[1] === 'png') {
    const size = pngDimensions(bytes);
    if (!size || size.width > LOGO_MAX_SIDE_PX || size.height > LOGO_MAX_SIDE_PX) return null;
    return { format: 'png', bytes };
  }

  return { format: 'jpeg', bytes };
}

/**
 * `Fatura_FAT-2026-00001.pdf`.
 *
 * O número é digitado pelo usuário e vai para um cabeçalho HTTP: qualquer
 * caractere fora de letras, dígitos, ponto, hífen e sublinhado vira hífen, o
 * que também tira aspas e barras que quebrariam o `Content-Disposition`.
 */
export function invoicePdfFilename(number: string): string {
  const safe = number.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `Fatura_${safe || 'sem-numero'}.pdf`;
}

export interface InvoicePdfFile {
  number: string;
  filename: string;
  body: Buffer;
}

export async function buildInvoicePdf(id: string): Promise<InvoicePdfFile> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          name: true,
          cpfCnpj: true,
          street: true,
          number: true,
          complement: true,
          neighborhood: true,
          city: true,
          state: true,
          zipCode: true,
        },
      },
      contract: { select: { serviceType: true } },
      payments: { select: { amount: true, paymentDate: true } },
    },
  });

  if (!invoice) {
    throw AppError.notFound('Fatura não encontrada.');
  }

  const settings = await getSettings();

  const amountCents = toCents(invoice.amount);
  const paidCents = invoice.payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  const dueDate = utcToIsoDate(invoice.dueDate);

  const lastPaymentDate = invoice.payments.reduce<string | null>((latest, payment) => {
    const date = utcToIsoDate(payment.paymentDate);
    return latest === null || date > latest ? date : latest;
  }, null);

  const body = await renderInvoicePdf({
    company: {
      name: settings.companyName,
      cnpj: settings.companyCnpj,
      street: settings.companyStreet,
      number: settings.companyNumber,
      complement: settings.companyComplement,
      logo: resolveLogo(settings.logo),
      paymentInstructions: settings.invoicePaymentInstructions,
    },
    client: invoice.client,
    invoice: {
      number: invoice.number,
      issueDate: utcToIsoDate(invoice.issueDate),
      dueDate,
      // Fatura sem descrição ainda precisa dizer o que está sendo cobrado: o
      // serviço do contrato, ou um texto genérico na fatura avulsa.
      service: invoice.description ?? invoice.contract?.serviceType ?? 'Serviços contábeis',
      amount: invoice.amount.toFixed(2),
      paidAmount: fromCents(paidCents),
      outstanding: fromCents(Math.max(amountCents - paidCents, 0)),
      notes: invoice.notes,
      status: effectiveInvoiceStatus(invoice.status, dueDate, today()),
      lastPaymentDate,
    },
  });

  return {
    number: invoice.number,
    filename: invoicePdfFilename(invoice.number),
    body: Buffer.from(body),
  };
}
