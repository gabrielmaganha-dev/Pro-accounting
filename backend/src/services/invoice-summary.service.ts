import { Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { today } from '../utils/date.js';

/**
 * Resumo financeiro de um conjunto de faturas.
 *
 * Existe como módulo próprio porque a MESMA derivação é usada na ficha do
 * cliente, na ficha do contrato e no painel. Se cada tela calculasse "quantas
 * faturas estão atrasadas" por conta própria, mais cedo ou mais tarde duas
 * delas discordariam — e o usuário não teria como saber qual acreditar.
 *
 * O ponto delicado é o status ATRASADA: ele **não existe no banco**. A coluna
 * `status` guarda PENDING, PAID ou CANCELLED; "atrasada" é uma fatura pendente
 * cujo vencimento já passou. Como isso depende da data de hoje, não pode ser
 * gravado — teria de ser recalculado todo dia à meia-noite. Derivar na consulta
 * é o que mantém o número correto sem nenhuma rotina agendada.
 */

export interface InvoiceSummary {
  invoices: {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
    cancelled: number;
  };
  amounts: {
    /** Valor de face emitido, EXCETO canceladas. */
    invoiced: string;
    received: string;
    /** Saldo em aberto das pendentes ainda no prazo. */
    pending: string;
    /** Saldo em aberto das vencidas. */
    overdue: string;
  };
}

/** Recorte das faturas: as de um cliente ou as de um contrato. */
export type InvoiceScope = { clientId: string } | { contractId: string };

interface SummaryRow {
  status: string;
  count: number;
  amount: string;
  outstanding: string;
}

const ZERO = '0.00';

export async function summarizeInvoices(scope: InvoiceScope): Promise<InvoiceSummary> {
  const referenceDate = today();

  // O recorte vira um fragmento SQL parametrizado. Continua sendo uma query
  // preparada: o id entra como parâmetro, nunca concatenado no texto.
  const filter =
    'clientId' in scope
      ? Prisma.sql`i.client_id = ${scope.clientId}`
      : Prisma.sql`i.contract_id = ${scope.contractId}`;

  const [rows, receivedRows] = await prisma.$transaction([
    prisma.$queryRaw<SummaryRow[]>`
      WITH paid AS (
        SELECT invoice_id, SUM(amount) AS total
        FROM payments
        GROUP BY invoice_id
      )
      SELECT
        CASE
          WHEN i.status = 'PENDING' AND i.due_date < ${referenceDate}::date THEN 'OVERDUE'
          ELSE i.status::text
        END AS status,
        COUNT(*)::int AS count,
        COALESCE(SUM(i.amount), 0)::numeric(14,2)::text AS amount,
        COALESCE(SUM(GREATEST(i.amount - COALESCE(p.total, 0), 0)), 0)::numeric(14,2)::text AS outstanding
      FROM invoices i
      LEFT JOIN paid p ON p.invoice_id = i.id
      WHERE ${filter}
      GROUP BY 1
    `,

    prisma.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(p.amount), 0)::numeric(14,2)::text AS total
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      WHERE ${filter}
    `,
  ]);

  const byStatus = new Map(rows.map((row) => [row.status, row]));

  return {
    invoices: {
      total: rows.reduce((sum, row) => sum + row.count, 0),
      paid: byStatus.get('PAID')?.count ?? 0,
      pending: byStatus.get('PENDING')?.count ?? 0,
      overdue: byStatus.get('OVERDUE')?.count ?? 0,
      cancelled: byStatus.get('CANCELLED')?.count ?? 0,
    },
    amounts: {
      /**
       * Total faturado: valor de face de tudo que foi emitido, EXCETO
       * canceladas.
       *
       * Fatura cancelada não é receita nem dívida — foi emitida por engano ou
       * o serviço não aconteceu. Incluí-la aqui inflaria o faturamento com
       * valor que ninguém jamais vai cobrar.
       */
      invoiced: sumAmounts(rows, ['PAID', 'PENDING', 'OVERDUE']),
      received: receivedRows[0]?.total ?? ZERO,
      pending: byStatus.get('PENDING')?.outstanding ?? ZERO,
      overdue: byStatus.get('OVERDUE')?.outstanding ?? ZERO,
    },
  };
}

/**
 * Soma valores de face de um conjunto de status.
 *
 * Feita em centavos inteiros e só depois dividida: somar "890.00" + "1250.00"
 * como float acumularia erro de arredondamento, exatamente o que o uso de
 * `numeric` no banco existe para evitar.
 */
function sumAmounts(rows: SummaryRow[], statuses: string[]): string {
  const totalCents = rows
    .filter((row) => statuses.includes(row.status))
    .reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);

  return (totalCents / 100).toFixed(2);
}
