import type { Invoice } from '@/types/invoice';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * Mensagem padrão para enviar a fatura por e-mail.
 *
 * Fica fora do diálogo para ser conferida sem abrir programa de e-mail: é texto
 * que vai para o cliente do escritório, e um valor ou vencimento errado aqui
 * seria cobrado errado.
 */
export interface InvoiceEmailDraft {
  to: string;
  subject: string;
  message: string;
}

export function invoiceEmailDraft(
  invoice: Pick<Invoice, 'number' | 'amount' | 'dueDate' | 'client'>,
  company: { name: string; paymentInstructions: string | null },
): InvoiceEmailDraft {
  const lines = [
    `Olá, ${invoice.client.name}.`,
    '',
    `Segue em anexo a fatura ${invoice.number}, no valor de ${formatCurrency(invoice.amount)}, ` +
      `com vencimento em ${formatDate(invoice.dueDate)}.`,
  ];

  if (company.paymentInstructions) {
    lines.push('', `Forma de pagamento: ${company.paymentInstructions}.`);
  }

  lines.push('', 'Qualquer dúvida, estamos à disposição.');

  if (company.name) {
    lines.push('', company.name);
  }

  return {
    to: invoice.client.email ?? '',
    subject: `Fatura ${invoice.number}${company.name ? ` — ${company.name}` : ''}`,
    message: lines.join('\n'),
  };
}

/**
 * Link `mailto:` com destinatário, assunto e corpo.
 *
 * As quebras de linha viram `\r\n`, a forma que todos os programas de e-mail
 * entendem dentro de um link. Anexo não cabe num `mailto:` — por isso o
 * diálogo baixa o PDF à parte.
 */
export function mailtoHref(draft: InvoiceEmailDraft): string {
  const body = draft.message.replace(/\r?\n/g, '\r\n');

  return (
    `mailto:${encodeURIComponent(draft.to.trim())}` +
    `?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`
  );
}
