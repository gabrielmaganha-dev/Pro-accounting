import { type Client, ClientHistoryAction, type Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { AppError } from '../utils/app-error.js';
import { today } from '../utils/date.js';
import { summarizeInvoices } from './invoice-summary.service.js';
import type {
  CreateClientInput,
  ListClientsQuery,
  UpdateClientInput,
} from '../validators/client.validator.js';

/**
 * CAMPOS QUE O PERFIL FUNCIONÁRIO PODE EDITAR.
 *
 * A especificação diz que o funcionário pode "atualizar informações permitidas
 * pelo administrador", sem dizer quais. Esta constante É essa definição.
 *
 * O critério adotado: dados de CONTATO, que mudam com frequência e cuja
 * correção é rotina de atendimento. Ficam de fora nome, razão social e
 * CPF/CNPJ — alterar a identidade fiscal de um cliente tem consequência em
 * guia de recolhimento e declaração, e é decisão de administrador.
 *
 * Para mudar a política, basta editar esta lista: a regra é lida em um lugar
 * só, tanto na API quanto (espelhada) na interface.
 */
export const EMPLOYEE_EDITABLE_FIELDS = [
  'email',
  'phone',
  'whatsapp',
  'zipCode',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'notes',
] as const satisfies readonly (keyof UpdateClientInput)[];

/** Rótulos dos campos, usados nas mensagens de erro e no histórico. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome / Razão social',
  companyName: 'Nome fantasia',
  cpfCnpj: 'CPF / CNPJ',
  stateRegistration: 'Inscrição Estadual',
  email: 'E-mail',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  zipCode: 'CEP',
  street: 'Rua',
  number: 'Número',
  complement: 'Complemento',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  notes: 'Observações',
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
// Listagem
// ---------------------------------------------------------------------------

export async function listClients(query: ListClientsQuery): Promise<PaginatedResult<Client>> {
  const where = buildWhere(query);

  // A contagem e a página são disparadas juntas na mesma transação: são duas
  // consultas que precisam enxergar o mesmo estado, senão a paginação pode
  // dizer "120 resultados" e entregar uma página que já não existe.
  const [total, items] = await prisma.$transaction([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: { [query.sort]: query.order },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

function buildWhere(query: ListClientsQuery): Prisma.ClientWhereInput {
  const where: Prisma.ClientWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.state) where.state = query.state;
  if (query.city) where.city = { contains: query.city, mode: 'insensitive' };

  if (query.search) {
    const term = query.search.trim();
    const digits = term.replace(/\D/g, '');

    const conditions: Prisma.ClientWhereInput[] = [
      { name: { contains: term, mode: 'insensitive' } },
      { companyName: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
    ];

    // Busca por documento só entra se o termo tiver dígitos. O usuário digita
    // "123.456" com máscara; comparar o texto formatado contra a coluna limpa
    // nunca encontraria nada.
    if (digits.length > 0) {
      conditions.push({ cpfCnpj: { contains: digits } });
    }

    where.OR = conditions;
  }

  return where;
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

export async function getClientById(id: string) {
  const client = await prisma.client.findUnique({ where: { id } });

  if (!client) {
    throw AppError.notFound('Cliente não encontrado.');
  }

  const [contracts, invoiceSummary] = await Promise.all([
    prisma.contract.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        serviceType: true,
        monthlyValue: true,
        dueDay: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    }),

    // Derivação de ATRASADA compartilhada com a ficha do contrato e o painel.
    summarizeInvoices({ clientId: id }),
  ]);

  return {
    ...client,
    contracts: contracts.map((contract) => ({
      ...contract,
      monthlyValue: contract.monthlyValue.toFixed(2),
    })),
    summary: {
      contracts: {
        total: contracts.length,
        active: contracts.filter((contract) => contract.status === 'ACTIVE').length,
      },
      invoices: invoiceSummary.invoices,
      amounts: invoiceSummary.amounts,
    },
  };
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export async function createClient(input: CreateClientInput, user: AuthenticatedUser) {
  const existing = await prisma.client.findUnique({
    where: { cpfCnpj: input.cpfCnpj },
    select: { id: true, name: true },
  });

  if (existing) {
    // Mensagem específica em vez do 409 genérico do Prisma: o usuário precisa
    // saber QUE cliente já usa o documento, senão fica tentando cadastrar de
    // novo achando que errou a digitação.
    throw AppError.conflict(
      `Este CPF/CNPJ já está cadastrado para "${existing.name}".`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({ data: input });

    await tx.clientHistory.create({
      data: {
        clientId: client.id,
        userId: user.id,
        action: ClientHistoryAction.CREATED,
      },
    });

    return client;
  });
}

// ---------------------------------------------------------------------------
// Atualização
// ---------------------------------------------------------------------------

export async function updateClient(
  id: string,
  input: UpdateClientInput,
  user: AuthenticatedUser,
) {
  const current = await prisma.client.findUnique({ where: { id } });

  if (!current) {
    throw AppError.notFound('Cliente não encontrado.');
  }

  // Autorização por campo. O funcionário pode editar contato, não identidade.
  if (user.role !== 'ADMIN') {
    const blocked = Object.keys(input).filter(
      (field) => !(EMPLOYEE_EDITABLE_FIELDS as readonly string[]).includes(field),
    );

    if (blocked.length > 0) {
      const labels = blocked.map((field) => FIELD_LABELS[field] ?? field).join(', ');
      throw AppError.forbidden(
        `Seu perfil não pode alterar: ${labels}. Solicite a um administrador.`,
      );
    }
  }

  if (input.cpfCnpj && input.cpfCnpj !== current.cpfCnpj) {
    const duplicate = await prisma.client.findUnique({
      where: { cpfCnpj: input.cpfCnpj },
      select: { id: true, name: true },
    });

    if (duplicate && duplicate.id !== id) {
      throw AppError.conflict(`Este CPF/CNPJ já está cadastrado para "${duplicate.name}".`);
    }
  }

  // O status é separado do resto porque merece um evento próprio no
  // histórico: "Cliente inativado" comunica a decisão de negócio, enquanto
  // "Situação: ACTIVE -> INACTIVE" enterraria essa informação no meio de
  // alterações de telefone e CEP.
  const { status, ...fields } = input;

  const changes = diffFields(current, fields);
  const statusChanged = status !== undefined && status !== current.status;

  // Nada mudou de fato: devolve o registro sem gravar linha de histórico.
  // Salvar um formulário sem alterar nada não deve poluir a auditoria.
  if (changes.length === 0 && !statusChanged) {
    return current;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({ where: { id }, data: input });

    if (changes.length > 0) {
      await tx.clientHistory.createMany({
        data: changes.map((change) => ({
          clientId: id,
          userId: user.id,
          action: ClientHistoryAction.UPDATED,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
        })),
      });
    }

    if (statusChanged) {
      await tx.clientHistory.create({
        data: {
          clientId: id,
          userId: user.id,
          action:
            status === 'ACTIVE'
              ? ClientHistoryAction.ACTIVATED
              : ClientHistoryAction.DEACTIVATED,
          field: 'status',
          oldValue: current.status,
          newValue: status,
        },
      });
    }

    return updated;
  });
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
 * intocados. Sem este filtro, editar um telefone geraria onze linhas de
 * histórico — dez delas dizendo "mudou de X para X" — e a aba de auditoria
 * ficaria inútil em duas semanas.
 */
function diffFields(current: Client, input: Record<string, unknown>): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const [field, rawNewValue] of Object.entries(input)) {
    const oldValue = current[field as keyof Client];

    const normalizedOld = oldValue === null || oldValue === undefined ? null : String(oldValue);
    const normalizedNew =
      rawNewValue === null || rawNewValue === undefined ? null : String(rawNewValue);

    if (normalizedOld !== normalizedNew) {
      changes.push({ field, oldValue: normalizedOld, newValue: normalizedNew });
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Situação
// ---------------------------------------------------------------------------

export async function setClientStatus(
  id: string,
  status: 'ACTIVE' | 'INACTIVE',
  user: AuthenticatedUser,
) {
  const current = await prisma.client.findUnique({
    where: { id },
    select: { id: true, status: true, name: true },
  });

  if (!current) {
    throw AppError.notFound('Cliente não encontrado.');
  }

  if (current.status === status) {
    throw AppError.conflict(
      status === 'ACTIVE' ? 'O cliente já está ativo.' : 'O cliente já está inativo.',
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.client.update({ where: { id }, data: { status } });

    await tx.clientHistory.create({
      data: {
        clientId: id,
        userId: user.id,
        action:
          status === 'ACTIVE'
            ? ClientHistoryAction.ACTIVATED
            : ClientHistoryAction.DEACTIVATED,
        field: 'status',
        oldValue: current.status,
        newValue: status,
      },
    });

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Exclusão
// ---------------------------------------------------------------------------

/**
 * Exclusão definitiva — permitida apenas quando não há histórico financeiro.
 *
 * O schema já impede a exclusão em cascata (`onDelete: Restrict`), então sem
 * esta checagem o banco recusaria com um erro de chave estrangeira cru e
 * incompreensível. Aqui a recusa vira uma mensagem que diz o motivo e aponta
 * a alternativa correta, que é inativar.
 *
 * Um cliente com contrato ou fatura NUNCA deve sumir: apagá-lo levaria junto
 * o rastro de valores recebidos, e isso é exatamente o que um escritório
 * contábil precisa conseguir provar anos depois.
 */
export async function deleteClient(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      _count: { select: { contracts: true, invoices: true } },
    },
  });

  if (!client) {
    throw AppError.notFound('Cliente não encontrado.');
  }

  const { contracts, invoices } = client._count;

  if (contracts > 0 || invoices > 0) {
    const parts: string[] = [];
    if (contracts > 0) parts.push(`${contracts} contrato(s)`);
    if (invoices > 0) parts.push(`${invoices} fatura(s)`);

    throw AppError.conflict(
      `Não é possível excluir "${client.name}": existem ${parts.join(' e ')} vinculados. ` +
        'Inative o cliente para tirá-lo da operação sem perder o histórico.',
    );
  }

  await prisma.client.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Faturas do cliente
// ---------------------------------------------------------------------------

export type EffectiveInvoiceFilter = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

/**
 * Faturas de um cliente, paginadas.
 *
 * Endpoint próprio em vez de embutir a lista em `GET /clients/:id`: um cliente
 * antigo acumula centenas de faturas, e devolvê-las todas na ficha tornaria a
 * abertura da tela lenta para quem só queria ver o telefone.
 *
 * O filtro por ATRASADA merece atenção: esse status não existe no banco. Ele
 * é traduzido para "pendente E vencimento no passado" — e, por consequência,
 * o filtro PENDENTE precisa excluir as vencidas, senão as atrasadas
 * apareceriam nos dois filtros e o usuário veria a mesma fatura duas vezes ao
 * alternar entre eles.
 */
export async function listClientInvoices(
  clientId: string,
  status: EffectiveInvoiceFilter | undefined,
  page: number,
  pageSize: number,
) {
  const exists = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });

  if (!exists) {
    throw AppError.notFound('Cliente não encontrado.');
  }

  const referenceDate = new Date(`${today()}T00:00:00.000Z`);

  const where: Prisma.InvoiceWhereInput = { clientId };

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
        contractId: true,
        contract: { select: { number: true } },
        payments: { select: { amount: true } },
      },
    }),
  ]);

  const referenceIso = today();

  return {
    items: items.map((invoice) => {
      const paidCents = invoice.payments.reduce(
        (sum, payment) => sum + Math.round(Number(payment.amount) * 100),
        0,
      );
      const amountCents = Math.round(Number(invoice.amount) * 100);

      return {
        id: invoice.id,
        number: invoice.number,
        description: invoice.description,
        amount: invoice.amount.toFixed(2),
        /** Quanto já entrou — permite a tela mostrar pagamento parcial. */
        paidAmount: (paidCents / 100).toFixed(2),
        outstanding: (Math.max(amountCents - paidCents, 0) / 100).toFixed(2),
        issueDate: invoice.issueDate.toISOString().slice(0, 10),
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        status:
          invoice.status === 'PENDING' &&
          invoice.dueDate.toISOString().slice(0, 10) < referenceIso
            ? 'OVERDUE'
            : invoice.status,
        contractId: invoice.contractId,
        contractNumber: invoice.contract?.number ?? null,
      };
    }),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

export async function getClientHistory(id: string, page: number, pageSize: number) {
  const exists = await prisma.client.findUnique({ where: { id }, select: { id: true } });

  if (!exists) {
    throw AppError.notFound('Cliente não encontrado.');
  }

  const [total, items] = await prisma.$transaction([
    prisma.clientHistory.count({ where: { clientId: id } }),
    prisma.clientHistory.findMany({
      where: { clientId: id },
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
      // Usuário removido do sistema deixa o histórico órfão, mas o registro
      // permanece: auditoria não pode desaparecer junto com a conta.
      userName: entry.user?.name ?? 'Usuário removido',
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
