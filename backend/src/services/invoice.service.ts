import {
  InvoiceHistoryAction,
  InvoiceStatus,
  type Invoice,
  type Prisma,
} from '@prisma/client';

import { prisma } from '../config/prisma.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { AppError } from '../utils/app-error.js';
import { isoDateToUtc, today, utcToIsoDate } from '../utils/date.js';
import {
  effectiveInvoiceStatus,
  fromCents,
  statusAfterPayments,
  toCents,
} from '../utils/invoice-status.js';
import type {
  CreateInvoiceInput,
  ListInvoicesQuery,
  RegisterPaymentInput,
  UpdateInvoiceInput,
} from '../validators/invoice.validator.js';

/** Rótulos dos campos, usados nas mensagens de erro e no histórico. */
const FIELD_LABELS: Record<string, string> = {
  clientId: 'Cliente',
  contractId: 'Contrato',
  number: 'Número',
  description: 'Descrição',
  amount: 'Valor',
  issueDate: 'Data de emissão',
  dueDate: 'Vencimento',
  status: 'Situação',
};

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Serialização
// ---------------------------------------------------------------------------

const CLIENT_SELECT = {
  id: true,
  name: true,
  companyName: true,
  cpfCnpj: true,
  status: true,
} as const;

const CONTRACT_SELECT = {
  id: true,
  number: true,
  serviceType: true,
  status: true,
} as const;

type InvoiceRow = Invoice & {
  client: { id: string; name: string; companyName: string | null; cpfCnpj: string; status: string };
  contract: { id: string; number: string; serviceType: string; status: string } | null;
  payments: { amount: Prisma.Decimal; paymentDate: Date }[];
};

/**
 * Converte o registro do banco para o formato que a API devolve.
 *
 * Três cuidados: `Decimal` vira string (passar por `number` perderia centavos),
 * datas de calendário viram `YYYY-MM-DD` sem hora (mandar ISO completo faria o
 * navegador aplicar fuso e exibir o dia anterior à noite), e o `status` que sai
 * daqui é o EFETIVO — nunca o cru da coluna.
 */
function toInvoiceDto(invoice: InvoiceRow, referenceIso: string) {
  const amountCents = toCents(invoice.amount);
  const paidCents = invoice.payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);

  // A data do último pagamento é o que a listagem mostra na coluna "Pagamento".
  const lastPaymentDate = invoice.payments.reduce<string | null>((latest, payment) => {
    const date = utcToIsoDate(payment.paymentDate);
    return latest === null || date > latest ? date : latest;
  }, null);

  const dueDate = utcToIsoDate(invoice.dueDate);

  return {
    id: invoice.id,
    number: invoice.number,
    description: invoice.description,
    amount: invoice.amount.toFixed(2),
    /** Quanto já entrou — permite a tela mostrar pagamento parcial. */
    paidAmount: fromCents(paidCents),
    outstanding: fromCents(Math.max(amountCents - paidCents, 0)),
    issueDate: utcToIsoDate(invoice.issueDate),
    dueDate,
    lastPaymentDate,
    paymentCount: invoice.payments.length,
    status: effectiveInvoiceStatus(invoice.status, dueDate, referenceIso),
    /** Situação crua da coluna. A interface usa para saber se dá para reabrir. */
    storedStatus: invoice.status,
    /** Dias de atraso, positivo apenas quando vencida e em aberto. */
    daysOverdue: daysBetween(dueDate, referenceIso),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    clientId: invoice.clientId,
    client: invoice.client,
    contractId: invoice.contractId,
    contract: invoice.contract,
  };
}

/** Dias inteiros entre duas datas `YYYY-MM-DD`. Negativo se `to` for anterior. */
function daysBetween(from: string, to: string): number {
  const diff = isoDateToUtc(to).getTime() - isoDateToUtc(from).getTime();
  return Math.round(diff / 86_400_000);
}

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------

export async function listInvoices(query: ListInvoicesQuery) {
  const referenceIso = today();
  const where = buildWhere(query, referenceIso);

  // A contagem e a página são disparadas juntas na mesma transação: são duas
  // consultas que precisam enxergar o mesmo estado, senão a paginação pode
  // dizer "120 resultados" e entregar uma página que já não existe.
  const [total, items] = await prisma.$transaction([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: buildOrderBy(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        client: { select: CLIENT_SELECT },
        contract: { select: CONTRACT_SELECT },
        payments: { select: { amount: true, paymentDate: true } },
      },
    }),
  ]);

  return {
    items: items.map((invoice) => toInvoiceDto(invoice as InvoiceRow, referenceIso)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

function buildOrderBy(query: ListInvoicesQuery): Prisma.InvoiceOrderByWithRelationInput {
  if (query.sort === 'client') {
    return { client: { name: query.order } };
  }

  return { [query.sort]: query.order };
}

function buildWhere(query: ListInvoicesQuery, referenceIso: string): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};
  const referenceDate = isoDateToUtc(referenceIso);

  if (query.clientId) where.clientId = query.clientId;
  if (query.contractId) where.contractId = query.contractId;

  /**
   * Tradução do filtro de situação.
   *
   * ATRASADA não existe na coluna — é "pendente E vencimento no passado". Por
   * consequência, PENDENTE precisa excluir as vencidas: se não excluísse, a
   * mesma fatura apareceria nos dois filtros e o usuário a veria duas vezes ao
   * alternar entre eles.
   */
  if (query.status === 'OVERDUE') {
    where.status = InvoiceStatus.PENDING;
    where.dueDate = { lt: referenceDate };
  } else if (query.status === 'PENDING') {
    where.status = InvoiceStatus.PENDING;
    where.dueDate = { gte: referenceDate };
  } else if (query.status) {
    where.status = query.status as InvoiceStatus;
  }

  if (query.issueFrom || query.issueTo) {
    where.issueDate = {
      ...(query.issueFrom ? { gte: isoDateToUtc(query.issueFrom) } : {}),
      ...(query.issueTo ? { lte: isoDateToUtc(query.issueTo) } : {}),
    };
  }

  // O filtro por período de vencimento convive com a tradução de ATRASADA
  // acima: os dois escrevem em `where.dueDate`, então o intervalo é mesclado
  // em vez de sobrescrito — senão pedir "atrasadas vencendo em março" devolveria
  // todas as de março, inclusive as em dia.
  if (query.dueFrom || query.dueTo) {
    where.dueDate = {
      ...(where.dueDate as Prisma.DateTimeFilter | undefined),
      ...(query.dueFrom ? { gte: isoDateToUtc(query.dueFrom) } : {}),
      ...(query.dueTo ? { lte: isoDateToUtc(query.dueTo) } : {}),
    };
  }

  if (query.minAmount !== undefined || query.maxAmount !== undefined) {
    where.amount = {
      ...(query.minAmount !== undefined ? { gte: query.minAmount } : {}),
      ...(query.maxAmount !== undefined ? { lte: query.maxAmount } : {}),
    };
  }

  if (query.search) {
    const term = query.search.trim();
    const digits = term.replace(/\D/g, '');

    const conditions: Prisma.InvoiceWhereInput[] = [
      { number: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { client: { name: { contains: term, mode: 'insensitive' } } },
      { client: { companyName: { contains: term, mode: 'insensitive' } } },
      { contract: { number: { contains: term, mode: 'insensitive' } } },
    ];

    // Busca por documento só entra se o termo tiver dígitos. O usuário digita
    // "123.456" com máscara; comparar o texto formatado contra a coluna limpa
    // nunca encontraria nada.
    if (digits.length > 0) {
      conditions.push({ client: { cpfCnpj: { contains: digits } } });
    }

    where.OR = conditions;
  }

  return where;
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

export async function getInvoiceById(id: string) {
  const referenceIso = today();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: { select: CLIENT_SELECT },
      contract: { select: CONTRACT_SELECT },
      payments: { select: { amount: true, paymentDate: true } },
    },
  });

  if (!invoice) {
    throw AppError.notFound('Fatura não encontrada.');
  }

  return toInvoiceDto(invoice as InvoiceRow, referenceIso);
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export async function createInvoice(input: CreateInvoiceInput, user: AuthenticatedUser) {
  // REGRA: fatura sem cliente não existe. A chave estrangeira já impediria a
  // gravação, mas o erro do Prisma seria um P2003 incompreensível.
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true },
  });

  if (!client) {
    throw AppError.notFound('Cliente não encontrado. Selecione um cliente válido.');
  }

  if (input.contractId) {
    await assertContractBelongsToClient(input.contractId, input.clientId);
  }

  await assertNumberIsFree(input.number);

  const created = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        clientId: input.clientId,
        contractId: input.contractId ?? null,
        number: input.number,
        description: input.description ?? null,
        amount: input.amount,
        issueDate: isoDateToUtc(input.issueDate),
        dueDate: isoDateToUtc(input.dueDate),
        // Nasce sempre PENDENTE. Uma fatura recém-emitida não pode nascer paga
        // (não há pagamento) nem atrasada (isso é derivado da data).
        status: InvoiceStatus.PENDING,
      },
    });

    await tx.invoiceHistory.create({
      data: {
        invoiceId: invoice.id,
        userId: user.id,
        action: InvoiceHistoryAction.CREATED,
      },
    });

    return invoice;
  });

  return getInvoiceById(created.id);
}

/**
 * Valida o contrato informado.
 *
 * Duas checagens, não uma: o contrato precisa existir E pertencer ao mesmo
 * cliente da fatura. Sem a segunda, seria possível emitir uma fatura para o
 * cliente A apontando para o contrato do cliente B — o vínculo pareceria
 * correto na tela da fatura e apareceria como receita na ficha do contrato
 * errado, corrompendo o financeiro dos dois.
 */
async function assertContractBelongsToClient(
  contractId: string,
  clientId: string,
): Promise<void> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, number: true, clientId: true, client: { select: { name: true } } },
  });

  if (!contract) {
    throw AppError.notFound('Contrato não encontrado. Selecione um contrato válido.');
  }

  if (contract.clientId !== clientId) {
    throw AppError.validation(
      `O contrato "${contract.number}" pertence a "${contract.client.name}", não ao cliente ` +
        'selecionado. Escolha um contrato do mesmo cliente ou deixe em branco para uma ' +
        'fatura avulsa.',
      [{ field: 'contractId', message: 'Contrato de outro cliente.' }],
    );
  }
}

/**
 * Recusa número já usado, com mensagem que diz de quem é.
 *
 * O índice único do banco já garantiria a unicidade, mas devolveria um P2002
 * cru. Saber QUAL fatura ocupa o número é o que permite ao usuário conferir se
 * não está duplicando um lançamento que já existe.
 */
async function assertNumberIsFree(number: string, ignoreId?: string): Promise<void> {
  const existing = await prisma.invoice.findUnique({
    where: { number },
    select: { id: true, client: { select: { name: true } } },
  });

  if (existing && existing.id !== ignoreId) {
    throw AppError.conflict(
      `O número "${number}" já está em uso por uma fatura de "${existing.client.name}".`,
    );
  }
}

// ---------------------------------------------------------------------------
// Atualização
// ---------------------------------------------------------------------------

export async function updateInvoice(
  id: string,
  input: UpdateInvoiceInput,
  user: AuthenticatedUser,
) {
  const current = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: { select: { amount: true } } },
  });

  if (!current) {
    throw AppError.notFound('Fatura não encontrada.');
  }

  if (current.status === InvoiceStatus.CANCELLED) {
    throw AppError.conflict(
      'Esta fatura está cancelada e não pode ser editada. Reabra-a antes de alterar os dados.',
    );
  }

  const paidCents = current.payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);

  /**
   * Reduzir o valor abaixo do que já foi pago deixaria a fatura com saldo
   * negativo — o escritório deveria dinheiro ao cliente, sem nenhum registro
   * de por quê. Quem precisa reduzir um valor já pago tem de estornar o
   * pagamento antes, e aí o estorno fica no histórico.
   */
  if (input.amount !== undefined && toCents(input.amount) < paidCents) {
    throw AppError.validation(
      `O valor não pode ficar abaixo dos ${formatBrl(paidCents)} já pagos. ` +
        'Estorne o pagamento antes de reduzir o valor da fatura.',
      [{ field: 'amount', message: 'Valor menor que o total já pago.' }],
    );
  }

  const finalClientId = input.clientId ?? current.clientId;

  if (input.clientId !== undefined && input.clientId !== current.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: { id: true },
    });

    if (!client) {
      throw AppError.notFound('Cliente não encontrado. Selecione um cliente válido.');
    }
  }

  // O contrato é revalidado sempre que o contrato OU o cliente mudam: trocar
  // só o cliente deixaria a fatura apontando para um contrato de terceiro.
  const finalContractId =
    input.contractId === undefined ? current.contractId : input.contractId;

  if (finalContractId && (input.contractId !== undefined || input.clientId !== undefined)) {
    await assertContractBelongsToClient(finalContractId, finalClientId);
  }

  if (input.number !== undefined && input.number !== current.number) {
    await assertNumberIsFree(input.number, id);
  }

  /**
   * Coerência das datas sobre os valores FINAIS.
   *
   * Uma edição pode mandar só uma das duas datas. Comparar apenas o que veio
   * no corpo deixaria passar o caso mais provável: mover a emissão para depois
   * de um vencimento que já estava gravado.
   */
  const finalIssue = input.issueDate ?? utcToIsoDate(current.issueDate);
  const finalDue = input.dueDate ?? utcToIsoDate(current.dueDate);

  if (finalDue < finalIssue) {
    throw AppError.validation('O vencimento não pode ser anterior à data de emissão.', [
      { field: 'dueDate', message: 'O vencimento não pode ser anterior à data de emissão.' },
    ]);
  }

  const data: Prisma.InvoiceUpdateInput = {};

  if (input.clientId !== undefined) data.client = { connect: { id: input.clientId } };
  if (input.contractId !== undefined) {
    data.contract = input.contractId
      ? { connect: { id: input.contractId } }
      : { disconnect: true };
  }
  if (input.number !== undefined) data.number = input.number;
  if (input.description !== undefined) data.description = input.description;
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.issueDate !== undefined) data.issueDate = isoDateToUtc(input.issueDate);
  if (input.dueDate !== undefined) data.dueDate = isoDateToUtc(input.dueDate);

  const changes = diffFields(current, input);

  // Nada mudou de fato: devolve o registro sem gravar linha de histórico.
  // Salvar um formulário sem alterar nada não deve poluir a auditoria.
  if (changes.length === 0) {
    return getInvoiceById(id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data });

    await tx.invoiceHistory.createMany({
      data: changes.map((change) => ({
        invoiceId: id,
        userId: user.id,
        action: InvoiceHistoryAction.UPDATED,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      })),
    });

    /**
     * Mudar o valor pode quitar (ou desquitar) a fatura sem nenhum pagamento
     * novo: baixar o valor para o que já foi pago encerra a dívida. Recalcular
     * aqui é o que impede a coluna `status` de ficar mentindo até alguém
     * lançar outro pagamento.
     */
    if (input.amount !== undefined) {
      const amountCents = toCents(input.amount);
      const nextStatus = statusAfterPayments(InvoiceStatus.PENDING, amountCents, paidCents);

      if (nextStatus !== current.status) {
        await tx.invoice.update({ where: { id }, data: { status: nextStatus } });

        if (nextStatus === InvoiceStatus.PAID) {
          await tx.invoiceHistory.create({
            data: {
              invoiceId: id,
              userId: user.id,
              action: InvoiceHistoryAction.SETTLED,
            },
          });
        }
      }
    }
  });

  return getInvoiceById(id);
}

interface FieldChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Compara o registro atual com a entrada e devolve só o que realmente mudou.
 *
 * O formulário envia todos os campos a cada salvamento, inclusive os
 * intocados. Sem este filtro, corrigir uma data geraria sete linhas de
 * histórico — seis delas dizendo "mudou de X para X" — e a aba de auditoria
 * ficaria inútil em duas semanas.
 */
function diffFields(current: Invoice, input: UpdateInvoiceInput): FieldChange[] {
  const changes: FieldChange[] = [];

  const normalize = (field: string, value: unknown): string | null => {
    if (value === null || value === undefined) return null;

    if (field === 'issueDate' || field === 'dueDate') {
      return value instanceof Date ? utcToIsoDate(value) : String(value);
    }

    if (field === 'amount') {
      return typeof value === 'object' && value !== null && 'toFixed' in value
        ? (value as Prisma.Decimal).toFixed(2)
        : Number(value).toFixed(2);
    }

    return String(value);
  };

  for (const [field, rawNewValue] of Object.entries(input)) {
    if (rawNewValue === undefined) continue;

    const oldValue = normalize(field, current[field as keyof Invoice]);
    const newValue = normalize(field, rawNewValue);

    if (oldValue !== newValue) {
      changes.push({ field, oldValue, newValue });
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Cancelamento e reabertura
// ---------------------------------------------------------------------------

export async function setInvoiceStatus(
  id: string,
  status: 'CANCELLED' | 'PENDING',
  user: AuthenticatedUser,
) {
  const current = await prisma.invoice.findUnique({
    where: { id },
    include: { payments: { select: { amount: true } } },
  });

  if (!current) {
    throw AppError.notFound('Fatura não encontrada.');
  }

  if (status === 'CANCELLED') {
    if (current.status === InvoiceStatus.CANCELLED) {
      throw AppError.conflict('Esta fatura já está cancelada.');
    }

    /**
     * Cancelar uma fatura com pagamento apagaria dinheiro que entrou de
     * verdade: a fatura sairia do faturamento, mas o pagamento continuaria
     * lançado, e os dois números deixariam de fechar. Quem precisa desfazer
     * uma cobrança já paga tem de estornar o pagamento primeiro — e o estorno
     * fica registrado no histórico, que é o ponto.
     */
    if (current.payments.length > 0) {
      throw AppError.conflict(
        `Esta fatura possui ${current.payments.length} pagamento(s) registrado(s) e não pode ` +
          'ser cancelada. Estorne os pagamentos antes, para que o valor recebido não ' +
          'desapareça do financeiro.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } });
      await tx.invoiceHistory.create({
        data: {
          invoiceId: id,
          userId: user.id,
          action: InvoiceHistoryAction.CANCELLED,
          field: 'status',
          oldValue: current.status,
          newValue: InvoiceStatus.CANCELLED,
        },
      });
    });

    return getInvoiceById(id);
  }

  // Reabertura
  if (current.status !== InvoiceStatus.CANCELLED) {
    throw AppError.conflict('Só é possível reabrir uma fatura cancelada.');
  }

  const paidCents = current.payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  const restored = statusAfterPayments(
    InvoiceStatus.PENDING,
    toCents(current.amount),
    paidCents,
  );

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: restored } });
    await tx.invoiceHistory.create({
      data: {
        invoiceId: id,
        userId: user.id,
        action: InvoiceHistoryAction.REOPENED,
        field: 'status',
        oldValue: InvoiceStatus.CANCELLED,
        newValue: restored,
      },
    });
  });

  return getInvoiceById(id);
}

// ---------------------------------------------------------------------------
// Exclusão
// ---------------------------------------------------------------------------

/**
 * Exclusão definitiva — permitida apenas quando não há pagamento.
 *
 * Atenção: `payments.invoice_id` é `onDelete: Cascade`. Sem esta checagem, o
 * banco apagaria os pagamentos JUNTO com a fatura, em silêncio — dinheiro
 * recebido sumiria do sistema sem deixar rastro. Esta é a única barreira, e
 * por isso não pode ser removida "porque o banco já protege".
 *
 * O cancelamento é o caminho correto: tira a fatura do faturamento e mantém o
 * documento e o histórico.
 */
export async function deleteInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      _count: { select: { payments: true } },
    },
  });

  if (!invoice) {
    throw AppError.notFound('Fatura não encontrada.');
  }

  if (invoice._count.payments > 0) {
    throw AppError.conflict(
      `Não é possível excluir a fatura "${invoice.number}": existem ` +
        `${invoice._count.payments} pagamento(s) registrado(s). Cancele a fatura para ` +
        'tirá-la do faturamento sem perder o histórico financeiro.',
    );
  }

  await prisma.invoice.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Pagamentos
// ---------------------------------------------------------------------------

export async function listInvoicePayments(invoiceId: string) {
  const exists = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true },
  });

  if (!exists) {
    throw AppError.notFound('Fatura não encontrada.');
  }

  const payments = await prisma.payment.findMany({
    where: { invoiceId },
    orderBy: { paymentDate: 'desc' },
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      paymentMethod: true,
      notes: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  });

  return payments.map((payment) => ({
    id: payment.id,
    amount: payment.amount.toFixed(2),
    paymentDate: utcToIsoDate(payment.paymentDate),
    paymentMethod: payment.paymentMethod,
    notes: payment.notes,
    createdAt: payment.createdAt.toISOString(),
    // Usuário removido do sistema deixa o lançamento órfão, mas o registro
    // permanece: auditoria não pode desaparecer junto com a conta.
    registeredByName: payment.user?.name ?? 'Usuário removido',
  }));
}

/**
 * Registra um pagamento e reavalia a situação da fatura.
 *
 * É aqui que a regra "se possuir pagamento, PAGO" é aplicada — na escrita, não
 * na leitura. O status gravado passa a PAID no mesmo instante em que o saldo
 * zera, dentro da mesma transação, para que nunca exista um estado em que o
 * pagamento está lançado mas a fatura ainda consta em aberto.
 */
export async function registerPayment(
  invoiceId: string,
  input: RegisterPaymentInput,
  user: AuthenticatedUser,
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      payments: { select: { amount: true, paymentDate: true, paymentMethod: true } },
    },
  });

  if (!invoice) {
    throw AppError.notFound('Fatura não encontrada.');
  }

  if (invoice.status === InvoiceStatus.CANCELLED) {
    throw AppError.conflict(
      'Não é possível registrar pagamento em uma fatura cancelada. Reabra-a antes.',
    );
  }

  /**
   * Proteção contra duplicata acidental.
   *
   * Mesma fatura, mesmo valor, mesma data e mesma forma é quase sempre o mesmo
   * dinheiro lançado duas vezes — duplo clique, página reaberta, duas pessoas
   * conferindo o extrato ao mesmo tempo. O estrago é silencioso: a fatura
   * aparece quitada, o recebido do mês infla, e a diferença só aparece na
   * conciliação bancária semanas depois.
   *
   * Não é uma trava absoluta. `confirmDuplicate` existe porque a coincidência
   * é possível, e quem está olhando o extrato sabe diferenciar — a API só se
   * recusa a decidir isso sozinha.
   */
  if (!input.confirmDuplicate) {
    const duplicate = invoice.payments.find(
      (payment) =>
        toCents(payment.amount) === toCents(input.amount) &&
        utcToIsoDate(payment.paymentDate) === input.paymentDate &&
        payment.paymentMethod === input.paymentMethod,
    );

    if (duplicate) {
      throw AppError.conflict(
        `Já existe um pagamento de ${formatBrl(toCents(input.amount))} nesta fatura, ` +
          `na mesma data e pela mesma forma. Se for mesmo um segundo pagamento, ` +
          'confirme para registrar assim mesmo.',
      );
    }
  }

  const amountCents = toCents(invoice.amount);
  const paidCents = invoice.payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  const outstandingCents = amountCents - paidCents;

  if (outstandingCents <= 0) {
    throw AppError.conflict('Esta fatura já está quitada.');
  }

  const paymentCents = toCents(input.amount);

  /**
   * Pagamento acima do saldo é recusado.
   *
   * A causa mais provável é erro de digitação — um zero a mais. Aceitar
   * criaria saldo negativo, que o sistema não tem como representar nem cobrar
   * de volta. A mensagem diz o saldo exato para o usuário corrigir na hora.
   */
  if (paymentCents > outstandingCents) {
    throw AppError.validation(
      `O pagamento de ${formatBrl(paymentCents)} excede o saldo em aberto de ` +
        `${formatBrl(outstandingCents)}. Ajuste o valor ou lance em duas parcelas.`,
      [{ field: 'amount', message: 'Valor acima do saldo em aberto.' }],
    );
  }

  const nextStatus = statusAfterPayments(
    invoice.status,
    amountCents,
    paidCents + paymentCents,
  );
  const settles = nextStatus === InvoiceStatus.PAID;

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId,
        amount: input.amount,
        paymentDate: isoDateToUtc(input.paymentDate),
        paymentMethod: input.paymentMethod,
        registeredBy: user.id,
        notes: input.notes ?? null,
      },
    });

    if (nextStatus !== invoice.status) {
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: nextStatus } });
    }

    await tx.invoiceHistory.create({
      data: {
        invoiceId,
        userId: user.id,
        action: InvoiceHistoryAction.PAYMENT_ADDED,
        field: 'amount',
        newValue: fromCents(paymentCents),
      },
    });

    if (settles) {
      await tx.invoiceHistory.create({
        data: {
          invoiceId,
          userId: user.id,
          action: InvoiceHistoryAction.SETTLED,
        },
      });
    }
  });

  return getInvoiceById(invoiceId);
}

/**
 * Estorna um pagamento lançado por engano.
 *
 * Não estava no enunciado, mas sem isso um valor digitado errado é permanente:
 * a fatura fica quitada para sempre e não há como corrigir o financeiro. O
 * estorno fica registrado no histórico, então a correção é auditável — que é a
 * diferença entre corrigir e encobrir.
 */
export async function removePayment(
  invoiceId: string,
  paymentId: string,
  user: AuthenticatedUser,
) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, invoiceId: true, amount: true },
  });

  if (!payment || payment.invoiceId !== invoiceId) {
    throw AppError.notFound('Pagamento não encontrado nesta fatura.');
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: { select: { id: true, amount: true } } },
  });

  if (!invoice) {
    throw AppError.notFound('Fatura não encontrada.');
  }

  const remainingCents = invoice.payments
    .filter((item) => item.id !== paymentId)
    .reduce((sum, item) => sum + toCents(item.amount), 0);

  const nextStatus = statusAfterPayments(
    invoice.status,
    toCents(invoice.amount),
    remainingCents,
  );

  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: paymentId } });

    if (nextStatus !== invoice.status) {
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: nextStatus } });
    }

    await tx.invoiceHistory.create({
      data: {
        invoiceId,
        userId: user.id,
        action: InvoiceHistoryAction.PAYMENT_REMOVED,
        field: 'amount',
        oldValue: payment.amount.toFixed(2),
      },
    });
  });

  return getInvoiceById(invoiceId);
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

export async function getInvoiceHistory(id: string, page: number, pageSize: number) {
  const exists = await prisma.invoice.findUnique({ where: { id }, select: { id: true } });

  if (!exists) {
    throw AppError.notFound('Fatura não encontrada.');
  }

  const [total, items] = await prisma.$transaction([
    prisma.invoiceHistory.count({ where: { invoiceId: id } }),
    prisma.invoiceHistory.findMany({
      where: { invoiceId: id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        field: true,
        oldValue: true,
        newValue: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  return {
    items: items.map((entry) => ({
      id: entry.id,
      action: entry.action,
      field: entry.field,
      fieldLabel: entry.field ? (FIELD_LABELS[entry.field] ?? entry.field) : null,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      createdAt: entry.createdAt.toISOString(),
      userName: entry.user?.name ?? 'Usuário removido',
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ---------------------------------------------------------------------------
// Sugestão de número
// ---------------------------------------------------------------------------

/**
 * Próximo número livre no padrão `FAT-<ano>-<sequência>`.
 *
 * É uma SUGESTÃO para preencher o formulário, não uma reserva: dois usuários
 * abrindo a tela ao mesmo tempo recebem o mesmo número. Quem garante a
 * unicidade de verdade é o índice do banco, e a colisão vira um 409 dizendo
 * qual fatura já ocupa o número.
 */
export async function suggestNextNumber(): Promise<{ number: string }> {
  const year = today().slice(0, 4);
  const prefix = `FAT-${year}-`;

  const last = await prisma.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const lastSequence = last ? Number(last.number.slice(prefix.length)) : 0;
  const next = Number.isFinite(lastSequence) && lastSequence > 0 ? lastSequence + 1 : 1;

  return { number: `${prefix}${String(next).padStart(5, '0')}` };
}

/** `189050` centavos -> `R$ 1.890,50`, para as mensagens de erro. */
function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
