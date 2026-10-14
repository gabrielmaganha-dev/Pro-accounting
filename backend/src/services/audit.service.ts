import { type AuditAction, type AuditEntity, Prisma } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import type { AuthenticatedUser } from '../types/auth.js';
import type { ListAuditQuery } from '../validators/audit.validator.js';

/**
 * Trilha de auditoria.
 *
 * Duas decisões governam este módulo:
 *
 * 1. **Registrar nunca derruba a operação.** Uma falha ao gravar o log é
 *    engolida e registrada no log do processo. A alternativa — abortar o
 *    pagamento porque a auditoria falhou — transformaria esta tabela em ponto
 *    único de falha do sistema inteiro. Para um escritório de contabilidade,
 *    perder uma linha de trilha é menos grave que recusar um recebimento.
 *
 *    ISTO É UMA ESCOLHA, não um descuido: se algum dia houver exigência
 *    regulatória de não-repúdio, ela precisa ser revista — a gravação passaria
 *    a fazer parte da mesma transação da operação auditada.
 *
 * 2. **A tabela é append-only.** Não existe rota de edição nem de exclusão, e
 *    o serviço não expõe função para isso. Uma trilha que o próprio
 *    administrador pode reescrever não prova nada — e é justamente o
 *    administrador quem teria motivo para apagar a própria linha.
 */

export interface AuditInput {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  /** Identificação legível: número da fatura, nome do cliente. */
  entityLabel?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Chaves cujo valor NUNCA entra no log, em qualquer nível do objeto.
 *
 * A auditoria recebe "dados relevantes da alteração" montados por quem chama,
 * e quem chama pode um dia repassar o corpo inteiro da requisição sem pensar.
 * Esta lista é a rede que impede uma senha de virar registro permanente — o
 * pior lugar possível para ela, porque a trilha é feita para ser preservada e
 * lida.
 */
const REDACTED_KEYS = [
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'temporarypassword',
  'token',
  'authorization',
  'secret',
  'jwt',
  'logo',
];

/** Profundidade máxima — um objeto cíclico ou muito aninhado não trava o processo. */
const MAX_DEPTH = 4;

/**
 * Remove segredos e encurta valores gigantes antes de gravar.
 *
 * O logotipo entra na lista de redação não por ser secreto, mas por ser um
 * data URL de centenas de kilobytes: gravá-lo a cada alteração de configuração
 * inflaria a tabela sem acrescentar informação — "o logotipo mudou" já é o que
 * interessa.
 */
export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth >= MAX_DEPTH) return '[profundo demais]';

  if (Array.isArray(value)) {
    // Arrays longos são truncados: uma edição em massa não deve gerar uma
    // linha de auditoria de megabytes.
    return value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (REDACTED_KEYS.includes(key.toLowerCase())) {
        out[key] = '[omitido]';
        continue;
      }

      out[key] = sanitizeMetadata(item, depth + 1);
    }

    return out;
  }

  if (typeof value === 'string' && value.length > 500) {
    return value.slice(0, 500) + '… [truncado]';
  }

  return value;
}

/**
 * Ator sem sessão — usado no login recusado, quando ainda não há usuário.
 *
 * Carrega o e-mail TENTADO, que é o dado que interessa numa sequência de
 * tentativas falhas: sem ele, a trilha mostraria só "alguém errou a senha".
 */
export interface AnonymousActor {
  email?: string | null;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

/**
 * Grava uma linha na trilha.
 *
 * Não devolve promessa de sucesso e não lança: ver a nota de cabeçalho do
 * módulo. Quem chama não precisa de `try/catch`.
 */
export async function recordAudit(
  actor: AuthenticatedUser | AnonymousActor | null,
  input: AuditInput,
): Promise<void> {
  try {
    const authenticated = actor !== null && 'id' in actor ? actor : null;

    await prisma.auditLog.create({
      data: {
        ...(authenticated ? { userId: authenticated.id, userName: authenticated.name } : {}),
        userEmail: actor?.email ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel ?? null,
        ip: actor?.ip ?? null,
        userAgent: actor?.userAgent ?? null,
        metadata: (sanitizeMetadata(input.metadata ?? null) ?? Prisma.DbNull) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    // Sem `request.log` aqui: o serviço não conhece a requisição. O console do
    // processo é o destino certo — se a auditoria parar de gravar, isso precisa
    // aparecer no log do servidor, não sumir.
    console.error('[auditoria] falha ao registrar evento', {
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Monta o `metadata` com apenas o que MUDOU.
 *
 * O formulário reenvia todos os campos a cada gravação; sem este filtro, uma
 * correção de telefone geraria uma linha dizendo que quinze campos mudaram de
 * X para X, e a trilha ficaria ilegível em duas semanas. É a mesma regra já
 * usada no histórico de clientes e faturas.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { de: unknown; para: unknown }> | null {
  const changes: Record<string, { de: unknown; para: unknown }> = {};

  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;

    const previous = before[key];

    // Comparação por texto: `Decimal` e `Date` não são iguais por identidade
    // nem por `===`, e comparar os objetos crus marcaria tudo como alterado.
    if (String(previous ?? '') === String(next ?? '')) continue;

    changes[key] = { de: previous ?? null, para: next ?? null };
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

const AUDIT_SELECT = {
  id: true,
  userId: true,
  userName: true,
  userEmail: true,
  action: true,
  entity: true,
  entityId: true,
  entityLabel: true,
  ip: true,
  userAgent: true,
  metadata: true,
  createdAt: true,
} as const satisfies Prisma.AuditLogSelect;

export async function listAuditLogs(query: ListAuditQuery) {
  const where: Prisma.AuditLogWhereInput = {};

  if (query.action) where.action = query.action;
  if (query.entity) where.entity = query.entity;
  if (query.userId) where.userId = query.userId;

  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      // Fim do dia: com `lte` na meia-noite, o filtro "até hoje" devolveria
      // zero linhas do próprio dia — o erro de intervalo mais comum.
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
    };
  }

  if (query.search) {
    const term = query.search.trim();

    where.OR = [
      { userName: { contains: term, mode: 'insensitive' } },
      { userEmail: { contains: term, mode: 'insensitive' } },
      { entityLabel: { contains: term, mode: 'insensitive' } },
      { ip: { contains: term } },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      select: AUDIT_SELECT,
      orderBy: { createdAt: 'desc' },
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

/** Números do topo da tela: volume recente e sinais que merecem atenção. */
export async function getAuditSummary() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, today, failedLogins, activeUsers] = await prisma.$transaction([
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }),
    // Tentativas recusadas na semana: é o número que denuncia alguém tentando
    // adivinhar senha, e o motivo de LOGIN_FAILED existir como ação própria.
    prisma.auditLog.count({
      where: { action: 'LOGIN_FAILED', createdAt: { gte: last7d } },
    }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: last7d }, userId: { not: null } },
      distinct: ['userId'],
      select: { userId: true },
    }),
  ]);

  return {
    total,
    last24h: today,
    failedLogins7d: failedLogins,
    activeUsers7d: activeUsers.length,
  };
}
