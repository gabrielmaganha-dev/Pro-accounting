import { InvoiceStatus } from '@prisma/client';

import { today, utcToIsoDate } from './date.js';

/**
 * REGRA DE SITUAÇÃO DA FATURA — fonte única do sistema.
 *
 * O enunciado pede três regras automáticas:
 *
 *   não paga e vencimento passou ....  PENDENTE -> ATRASADA
 *   possui pagamento que cobre tudo ..  PAGA
 *   cancelada .......................  CANCELADA
 *
 * Elas são aplicadas em dois momentos diferentes, e entender por quê é o que
 * mantém o sistema coerente:
 *
 * ── ATRASADA é DERIVADA na leitura, nunca gravada ────────────────────────────
 *
 * Uma fatura se torna atrasada pela simples passagem do tempo, sem ninguém agir
 * sobre ela. Se `OVERDUE` fosse gravado na coluna, estaria errado todos os dias
 * até alguém rodar uma rotina de atualização — e bastaria essa rotina falhar
 * num fim de semana para o escritório cobrar juros de quem está em dia, ou
 * deixar de cobrar de quem não está. Por isso a coluna `invoices.status` só
 * guarda PENDING, PAID ou CANCELLED, e ATRASADA sai daqui.
 *
 * ── PAGA é GRAVADA na escrita ────────────────────────────────────────────────
 *
 * O oposto: pagamento é um evento com autor, data e valor. Quando os
 * pagamentos cobrem o valor de face, o serviço grava PAID na hora. Não fica
 * derivado porque o filtro da listagem precisa de uma coluna indexável — e
 * porque "quitada" é um fato que aconteceu, não uma condição que muda sozinha.
 *
 * Nada disso é decidido no frontend. A interface exibe o que a API devolve; se
 * ela calculasse por conta própria, dois navegadores com relógios diferentes
 * discordariam sobre quais faturas estão atrasadas.
 */

export type EffectiveInvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

/**
 * Situação exibida ao usuário, a partir do que está gravado.
 *
 * `referenceIso` é injetável para o cálculo ser testável sem depender do
 * relógio da máquina.
 */
export function effectiveInvoiceStatus(
  storedStatus: InvoiceStatus,
  dueDate: Date | string,
  referenceIso: string = today(),
): EffectiveInvoiceStatus {
  if (storedStatus === InvoiceStatus.CANCELLED) return 'CANCELLED';
  if (storedStatus === InvoiceStatus.PAID) return 'PAID';

  const due = typeof dueDate === 'string' ? dueDate : utcToIsoDate(dueDate);

  // Comparação entre duas strings `YYYY-MM-DD`: ordem lexicográfica e ordem
  // cronológica coincidem nesse formato, então não há conversão de fuso no
  // caminho. Vencimento HOJE não está atrasado — só a partir do dia seguinte.
  return due < referenceIso ? 'OVERDUE' : 'PENDING';
}

/**
 * Situação a GRAVAR depois de um lançamento ou estorno de pagamento.
 *
 * Fatura cancelada não muda de situação por causa de pagamento: quem cancelou
 * tomou uma decisão que um lançamento posterior não deve desfazer em silêncio.
 * Pagamento parcial também não quita — continua PENDING, e o saldo em aberto é
 * o que a tela mostra.
 */
export function statusAfterPayments(
  currentStatus: InvoiceStatus,
  amountCents: number,
  paidCents: number,
): InvoiceStatus {
  if (currentStatus === InvoiceStatus.CANCELLED) return InvoiceStatus.CANCELLED;

  return paidCents >= amountCents ? InvoiceStatus.PAID : InvoiceStatus.PENDING;
}

/** Converte um Decimal do Prisma (ou string) em centavos inteiros. */
export function toCents(value: { toFixed(digits: number): string } | string | number): number {
  const text = typeof value === 'object' ? value.toFixed(2) : String(value);
  return Math.round(Number(text) * 100);
}

/** Converte centavos inteiros de volta para o formato da API (`"1500.00"`). */
export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
