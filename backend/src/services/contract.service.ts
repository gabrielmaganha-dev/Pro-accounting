import { type Contract, type Prisma, ContractStatus } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { AppError } from '../utils/app-error.js';
import { isoDateToUtc, today, utcToIsoDate } from '../utils/date.js';
import type {
  CreateContractInput,
  ListContractsQuery,
  RenewContractInput,
  UpdateContractInput,
} from '../validators/contract.validator.js';
import { summarizeInvoices } from './invoice-summary.service.js';

/** Rótulos em português, usados nas mensagens de erro. */
const STATUS_LABELS: Record<ContractStatus, string> = {
  ACTIVE: 'Ativo',
  PENDING: 'Pendente',
  RENEWAL: 'Em renovação',
  CLOSED: 'Encerrado',
  CANCELLED: 'Cancelado',
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

/** Dados do cliente que acompanham o contrato nas listagens e na ficha. */
const CLIENT_SELECT = {
  id: true,
  name: true,
  companyName: true,
  cpfCnpj: true,
  status: true,
} as const;

type ContractWithClient = Contract & {
  client: { id: string; name: string; companyName: string | null; cpfCnpj: string; status: string };
};

/**
 * Converte o registro do banco para o formato que a API devolve.
 *
 * Dois cuidados: `Decimal` vira string (passar por `number` perderia centavos
 * em valores grandes) e as datas de calendário viram `YYYY-MM-DD` sem hora —
 * mandar um ISO completo faria o navegador do usuário aplicar fuso e exibir o
 * dia anterior à noite.
 */
function toContractDto(contract: ContractWithClient) {
  return {
    id: contract.id,
    number: contract.number,
    serviceType: contract.serviceType,
    monthlyValue: contract.monthlyValue.toFixed(2),
    dueDay: contract.dueDay,
    startDate: utcToIsoDate(contract.startDate),
    endDate: contract.endDate ? utcToIsoDate(contract.endDate) : null,
    status: contract.status,
    notes: contract.notes,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
    clientId: contract.clientId,
    client: {
      id: contract.client.id,
      name: contract.client.name,
      companyName: contract.client.companyName,
      cpfCnpj: contract.client.cpfCnpj,
      status: contract.client.status,
    },
  };
}

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------

export async function listContracts(query: ListContractsQuery) {
  const where = buildWhere(query);

  // A contagem e a página são disparadas juntas na mesma transação: são duas
  // consultas que precisam enxergar o mesmo estado, senão a paginação pode
  // dizer "120 resultados" e entregar uma página que já não existe.
  const [total, items] = await prisma.$transaction([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      orderBy: buildOrderBy(query),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { client: { select: CLIENT_SELECT } },
    }),
  ]);

  return {
    items: items.map(toContractDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/**
 * Ordenação.
 *
 * "client" não é uma coluna de `contracts`: ordenar por cliente significa
 * ordenar pelo NOME do cliente na tabela relacionada, que o Prisma resolve com
 * um orderBy aninhado.
 */
function buildOrderBy(query: ListContractsQuery): Prisma.ContractOrderByWithRelationInput {
  if (query.sort === 'client') {
    return { client: { name: query.order } };
  }

  return { [query.sort]: query.order };
}

function buildWhere(query: ListContractsQuery): Prisma.ContractWhereInput {
  const where: Prisma.ContractWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.clientId) where.clientId = query.clientId;

  if (query.expiringInDays !== undefined) {
    const from = today();
    const until = new Date(isoDateToUtc(from));
    until.setUTCDate(until.getUTCDate() + query.expiringInDays);

    // Contrato por prazo indeterminado (endDate nulo) fica de fora por
    // definição: sem data de término, não há vencimento a antecipar.
    where.endDate = { gte: isoDateToUtc(from), lte: until };

    // Encerrado e cancelado já saíram de operação — alertar sobre o
    // "vencimento" deles seria ruído.
    where.status = query.status ?? { in: ['ACTIVE', 'PENDING', 'RENEWAL'] };
  }

  if (query.search) {
    const term = query.search.trim();
    const digits = term.replace(/\D/g, '');

    const conditions: Prisma.ContractWhereInput[] = [
      { number: { contains: term, mode: 'insensitive' } },
      { serviceType: { contains: term, mode: 'insensitive' } },
      { client: { name: { contains: term, mode: 'insensitive' } } },
      { client: { companyName: { contains: term, mode: 'insensitive' } } },
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

export async function getContractById(id: string) {
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { client: { select: CLIENT_SELECT } },
  });

  if (!contract) {
    throw AppError.notFound('Contrato não encontrado.');
  }

  const summary = await summarizeInvoices({ contractId: id });

  return {
    ...toContractDto(contract),
    summary,
  };
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export async function createContract(input: CreateContractInput) {
  // REGRA CENTRAL: contrato sem cliente não existe. A chave estrangeira já
  // impediria a gravação, mas o erro do Prisma seria um P2003 incompreensível.
  // Conferir antes permite responder 404 dizendo o que está errado.
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, name: true, status: true },
  });

  if (!client) {
    throw AppError.notFound('Cliente não encontrado. Selecione um cliente válido.');
  }

  await assertNumberIsFree(input.number);

  const contract = await prisma.contract.create({
    data: {
      clientId: input.clientId,
      number: input.number,
      serviceType: input.serviceType,
      startDate: isoDateToUtc(input.startDate),
      endDate: input.endDate ? isoDateToUtc(input.endDate) : null,
      monthlyValue: input.monthlyValue,
      dueDay: input.dueDay,
      status: input.status,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    },
    include: { client: { select: CLIENT_SELECT } },
  });

  return toContractDto(contract);
}

/**
 * Recusa número já usado, com mensagem que diz de quem é.
 *
 * O índice único do banco já garantiria a unicidade, mas devolveria um P2002
 * cru. Saber QUAL contrato ocupa o número é o que permite ao usuário conferir
 * se não está duplicando um cadastro que já existe.
 */
async function assertNumberIsFree(number: string, ignoreId?: string): Promise<void> {
  const existing = await prisma.contract.findUnique({
    where: { number },
    select: { id: true, client: { select: { name: true } } },
  });

  if (existing && existing.id !== ignoreId) {
    throw AppError.conflict(
      `O número "${number}" já está em uso pelo contrato de "${existing.client.name}".`,
    );
  }
}

// ---------------------------------------------------------------------------
// Atualização
// ---------------------------------------------------------------------------

export async function updateContract(
  id: string,
  input: UpdateContractInput,
  user: AuthenticatedUser,
) {
  const current = await prisma.contract.findUnique({ where: { id } });

  if (!current) {
    throw AppError.notFound('Contrato não encontrado.');
  }

  /**
   * Mudança de situação pelo formulário exige perfil ADMIN.
   *
   * Sem esta checagem haveria um buraco na autorização: encerrar e cancelar
   * estão protegidos em `PATCH /contracts/:id/status`, mas o funcionário
   * poderia obter o mesmo efeito mandando `status` no corpo do PUT.
   */
  if (input.status !== undefined && input.status !== current.status && user.role !== 'ADMIN') {
    throw AppError.forbidden(
      'Seu perfil não pode alterar a situação do contrato. Solicite a um administrador.',
    );
  }

  if (input.clientId !== undefined && input.clientId !== current.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: { id: true },
    });

    if (!client) {
      throw AppError.notFound('Cliente não encontrado. Selecione um cliente válido.');
    }
  }

  if (input.number !== undefined && input.number !== current.number) {
    await assertNumberIsFree(input.number, id);
  }

  /**
   * Coerência das datas sobre os valores FINAIS.
   *
   * Uma edição pode mandar só uma das duas datas. Comparar apenas o que veio
   * no corpo deixaria passar o caso mais provável: mover a data de início para
   * depois de um término que já estava gravado.
   */
  const finalStart = input.startDate ?? utcToIsoDate(current.startDate);
  const finalEnd =
    input.endDate === undefined
      ? current.endDate
        ? utcToIsoDate(current.endDate)
        : null
      : input.endDate;

  if (finalEnd && finalEnd < finalStart) {
    throw AppError.validation('A data de término não pode ser anterior à data de início.', [
      { field: 'endDate', message: 'A data de término não pode ser anterior à data de início.' },
    ]);
  }

  const data: Prisma.ContractUpdateInput = {};

  if (input.clientId !== undefined) data.client = { connect: { id: input.clientId } };
  if (input.number !== undefined) data.number = input.number;
  if (input.serviceType !== undefined) data.serviceType = input.serviceType;
  if (input.startDate !== undefined) data.startDate = isoDateToUtc(input.startDate);
  if (input.endDate !== undefined) {
    data.endDate = input.endDate ? isoDateToUtc(input.endDate) : null;
  }
  if (input.monthlyValue !== undefined) data.monthlyValue = input.monthlyValue;
  if (input.dueDay !== undefined) data.dueDay = input.dueDay;
  if (input.status !== undefined) data.status = input.status;
  if (input.notes !== undefined) data.notes = input.notes ?? null;

  const updated = await prisma.contract.update({
    where: { id },
    data,
    include: { client: { select: CLIENT_SELECT } },
  });

  return toContractDto(updated);
}

// ---------------------------------------------------------------------------
// Situação: encerrar, cancelar, reabrir
// ---------------------------------------------------------------------------

export async function setContractStatus(id: string, status: ContractStatus) {
  const current = await prisma.contract.findUnique({ where: { id } });

  if (!current) {
    throw AppError.notFound('Contrato não encontrado.');
  }

  if (current.status === status) {
    throw AppError.conflict(`O contrato já está com a situação "${STATUS_LABELS[status]}".`);
  }

  const data: Prisma.ContractUpdateInput = { status };

  /**
   * Encerrar registra QUANDO o contrato acabou.
   *
   * Um contrato encerrado hoje mas com término previsto para dezembro
   * continuaria contando como vigente em qualquer relatório por período. Por
   * isso o encerramento antecipa a data de término para hoje — mas só quando
   * ela é nula (prazo indeterminado) ou está no futuro. Se o término já
   * passou, o contrato apenas chegou ao fim e a data original é a correta.
   */
  if (status === ContractStatus.CLOSED) {
    const reference = today();
    const currentEnd = current.endDate ? utcToIsoDate(current.endDate) : null;

    if (!currentEnd || currentEnd > reference) {
      data.endDate = isoDateToUtc(reference);
    }
  }

  const updated = await prisma.contract.update({
    where: { id },
    data,
    include: { client: { select: CLIENT_SELECT } },
  });

  return toContractDto(updated);
}

// ---------------------------------------------------------------------------
// Renovação
// ---------------------------------------------------------------------------

/**
 * Renova o contrato estendendo a vigência do MESMO registro.
 *
 * A alternativa seria criar um contrato novo e encerrar o antigo. Foi
 * descartada porque as faturas apontam para `contract_id`: partir a renovação
 * em dois registros espalharia o histórico financeiro do mesmo acordo por dois
 * contratos, e o "total faturado" da ficha zeraria a cada renovação — logo na
 * tela que existe para mostrar quanto aquele contrato já rendeu.
 *
 * O reajuste de valor entra junto porque é a razão mais comum de uma renovação
 * não ser apenas prorrogação de prazo.
 */
export async function renewContract(id: string, input: RenewContractInput) {
  const current = await prisma.contract.findUnique({ where: { id } });

  if (!current) {
    throw AppError.notFound('Contrato não encontrado.');
  }

  if (current.status === ContractStatus.CANCELLED) {
    throw AppError.conflict(
      'Contrato cancelado não pode ser renovado. Cadastre um novo contrato para o cliente.',
    );
  }

  if (!current.endDate) {
    throw AppError.conflict(
      'Este contrato é por prazo indeterminado e não tem término a prorrogar. ' +
        'Para reajustar o valor, use a edição.',
    );
  }

  const currentEnd = utcToIsoDate(current.endDate);

  if (input.endDate <= currentEnd) {
    throw AppError.validation(
      `A nova data de término precisa ser posterior à atual (${formatBr(currentEnd)}).`,
      [{ field: 'endDate', message: 'A renovação precisa estender o prazo do contrato.' }],
    );
  }

  const updated = await prisma.contract.update({
    where: { id },
    data: {
      endDate: isoDateToUtc(input.endDate),
      // A renovação devolve o contrato à operação: um contrato encerrado ou em
      // renovação que ganha prazo novo está ativo outra vez.
      status: ContractStatus.ACTIVE,
      ...(input.monthlyValue === undefined ? {} : { monthlyValue: input.monthlyValue }),
    },
    include: { client: { select: CLIENT_SELECT } },
  });

  return toContractDto(updated);
}

/** `2026-12-31` -> `31/12/2026`, para a mensagem de erro ficar legível. */
function formatBr(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

// ---------------------------------------------------------------------------
// Exclusão
// ---------------------------------------------------------------------------

/**
 * Exclusão definitiva — permitida apenas quando não há faturas.
 *
 * Mesma política dos clientes, e pelo mesmo motivo: o histórico financeiro não
 * pode desaparecer porque alguém apagou o registro que o originou. A diferença
 * é que aqui o banco NÃO protege sozinho — `invoices.contract_id` é
 * `onDelete: SetNull`, então apagar o contrato deixaria as faturas órfãs, em
 * silêncio, em vez de recusar. Esta checagem é a única barreira.
 *
 * Para tirar um contrato de operação sem perder o histórico, existe o
 * encerramento.
 */
export async function deleteContract(id: string) {
  const contract = await prisma.contract.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      _count: { select: { invoices: true } },
    },
  });

  if (!contract) {
    throw AppError.notFound('Contrato não encontrado.');
  }

  if (contract._count.invoices > 0) {
    throw AppError.conflict(
      `Não é possível excluir o contrato "${contract.number}": existem ` +
        `${contract._count.invoices} fatura(s) vinculadas. Encerre o contrato para tirá-lo ` +
        'de operação sem perder o histórico financeiro.',
    );
  }

  await prisma.contract.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Faturas do contrato
// ---------------------------------------------------------------------------

export type EffectiveInvoiceFilter = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

/**
 * Faturas de um contrato, paginadas.
 *
 * O filtro por ATRASADA merece atenção: esse status não existe no banco. Ele é
 * traduzido para "pendente E vencimento no passado" — e, por consequência, o
 * filtro PENDENTE precisa excluir as vencidas, senão as atrasadas apareceriam
 * nos dois filtros e o usuário veria a mesma fatura duas vezes ao alternar
 * entre eles.
 */
export async function listContractInvoices(
  contractId: string,
  status: EffectiveInvoiceFilter | undefined,
  page: number,
  pageSize: number,
) {
  const exists = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true },
  });

  if (!exists) {
    throw AppError.notFound('Contrato não encontrado.');
  }

  const referenceIso = today();
  const referenceDate = isoDateToUtc(referenceIso);

  const where: Prisma.InvoiceWhereInput = { contractId };

  if (status === 'OVERDUE') {
    where.status = 'PENDING';
    where.dueDate = { lt: referenceDate };
  } else if (status === 'PENDING') {
    where.status = 'PENDING';
    where.dueDate = { gte: referenceDate };
  } else if (status) {
    where.status = status;
  }

  const [total, items] = await prisma.$transaction([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { dueDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        description: true,
        amount: true,
        issueDate: true,
        dueDate: true,
        status: true,
        payments: { select: { amount: true } },
      },
    }),
  ]);

  return {
    items: items.map((invoice) => {
      const paidCents = invoice.payments.reduce(
        (sum, payment) => sum + Math.round(Number(payment.amount) * 100),
        0,
      );
      const amountCents = Math.round(Number(invoice.amount) * 100);
      const dueDate = utcToIsoDate(invoice.dueDate);

      return {
        id: invoice.id,
        number: invoice.number,
        description: invoice.description,
        amount: invoice.amount.toFixed(2),
        /** Quanto já entrou — permite a tela mostrar pagamento parcial. */
        paidAmount: (paidCents / 100).toFixed(2),
        outstanding: (Math.max(amountCents - paidCents, 0) / 100).toFixed(2),
        issueDate: utcToIsoDate(invoice.issueDate),
        dueDate,
        status:
          invoice.status === 'PENDING' && dueDate < referenceIso ? 'OVERDUE' : invoice.status,
      };
    }),
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
 * Próximo número livre no padrão `CT-<ano>-<sequência>`.
 *
 * É uma SUGESTÃO para preencher o formulário, não uma reserva: dois usuários
 * abrindo a tela ao mesmo tempo recebem o mesmo número. Quem garante a
 * unicidade de verdade é o índice do banco, e a colisão vira um 409 dizendo
 * qual contrato já ocupa o número. Reservar de fato exigiria uma tabela de
 * sequência e um bloqueio — custo alto para um campo que o usuário pode
 * sobrescrever com a numeração própria do escritório.
 */
export async function suggestNextNumber(): Promise<{ number: string }> {
  const year = today().slice(0, 4);
  const prefix = `CT-${year}-`;

  const last = await prisma.contract.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  const lastSequence = last ? Number(last.number.slice(prefix.length)) : 0;
  const next = Number.isFinite(lastSequence) && lastSequence > 0 ? lastSequence + 1 : 1;

  return { number: `${prefix}${String(next).padStart(4, '0')}` };
}
