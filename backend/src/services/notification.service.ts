import {
  InvoiceStatus,
  NotificationSeverity,
  NotificationType,
  type Prisma,
  UserStatus,
} from '@prisma/client';

import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/app-error.js';
import {
  CONTRACT_EXPIRY_WINDOW_DAYS,
  invoiceDueSoonWindowDays,
  addDays,
  isoDateToUtc,
  today,
  utcToIsoDate,
} from '../utils/date.js';
import {
  NOTIFICATION_CHANNELS,
  type NotificationPayload,
  type NotificationRecipient,
} from './notification-channels.js';
import { markSwept, shouldSweep } from './notification-sweep-state.js';
import type { ListNotificationsQuery } from '../validators/notification.validator.js';

/**
 * Notificações internas.
 *
 * ---------------------------------------------------------------------------
 * COMO ELAS NASCEM
 * ---------------------------------------------------------------------------
 * Não são disparadas por eventos ("ao salvar a fatura, crie um aviso"). São
 * DERIVADAS do estado atual por uma varredura idempotente.
 *
 * O motivo é o mesmo que faz OVERDUE não ser gravado nas faturas: uma fatura
 * fica atrasada pela passagem do tempo, sem ninguém agir sobre ela. Um gatilho
 * de evento nunca dispararia, porque evento nenhum aconteceu. A varredura
 * compara "o que deveria estar avisado" com "o que está" e acerta os dois
 * lados — cria o que falta e REMOVE o que deixou de valer.
 *
 * Remover é tão importante quanto criar: um aviso de "fatura atrasada" de uma
 * fatura já paga é ruído que ensina o usuário a ignorar o sino. A lista é uma
 * fila de pendências, não um registro histórico — para histórico existe a aba
 * de auditoria da fatura.
 *
 * As janelas (7 dias para vencimento próximo, 30 para contrato) são as mesmas
 * constantes usadas pelos alertas do painel. Duas definições divergiriam, e o
 * sino passaria a discordar do painel na mesma tela.
 */

/** Tipos mantidos pela varredura. Só estes são criados e removidos por ela. */
const MANAGED_TYPES: NotificationType[] = [
  NotificationType.INVOICE_OVERDUE,
  NotificationType.INVOICE_DUE_SOON,
  NotificationType.CONTRACT_EXPIRING,
];

interface DesiredNotification {
  dedupeKey: string;
  userId: string;
  payload: NotificationPayload;
  invoiceId?: string;
  contractId?: string;
  clientId?: string;
}

const INVOICE_ALERT_SELECT = {
  id: true,
  number: true,
  amount: true,
  dueDate: true,
  clientId: true,
  client: { select: { name: true } },
} as const;

// ---------------------------------------------------------------------------
// Varredura
// ---------------------------------------------------------------------------

export async function syncNotifications(force = false): Promise<void> {
  if (!force && !shouldSweep()) return;
  markSwept();

  const reference = today();

  const [recipients, overdue, dueSoon, expiring] = await Promise.all([
    // Só usuários ativos: quem está bloqueado ou aguardando aprovação não deve
    // acumular pendências.
    prisma.user.findMany({
      where: { status: UserStatus.ACTIVE },
      select: { id: true, name: true, email: true },
    }),

    prisma.invoice.findMany({
      where: { status: InvoiceStatus.PENDING, dueDate: { lt: isoDateToUtc(reference) } },
      select: INVOICE_ALERT_SELECT,
      orderBy: { dueDate: 'asc' },
    }),

    prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.PENDING,
        dueDate: {
          gte: isoDateToUtc(reference),
          lte: isoDateToUtc(addDays(reference, invoiceDueSoonWindowDays())),
        },
      },
      select: INVOICE_ALERT_SELECT,
      orderBy: { dueDate: 'asc' },
    }),

    prisma.contract.findMany({
      where: {
        status: { in: ['ACTIVE', 'PENDING', 'RENEWAL'] },
        endDate: {
          gte: isoDateToUtc(reference),
          lte: isoDateToUtc(addDays(reference, CONTRACT_EXPIRY_WINDOW_DAYS)),
        },
      },
      select: {
        id: true,
        number: true,
        endDate: true,
        clientId: true,
        client: { select: { name: true } },
      },
      orderBy: { endDate: 'asc' },
    }),
  ]);

  if (recipients.length === 0) return;

  const desired: DesiredNotification[] = [];

  for (const user of recipients) {
    for (const invoice of overdue) {
      const due = utcToIsoDate(invoice.dueDate);
      const days = daysBetween(due, reference);
      const atraso = days === 1 ? 'há 1 dia' : 'há ' + days + ' dias';

      desired.push({
        dedupeKey: key(NotificationType.INVOICE_OVERDUE, invoice.id, user.id),
        userId: user.id,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        payload: {
          type: NotificationType.INVOICE_OVERDUE,
          severity: NotificationSeverity.CRITICAL,
          title: 'Fatura ' + invoice.number + ' atrasada',
          message:
            'Fatura ' + invoice.number + ' do cliente ' + invoice.client.name +
            ' está atrasada ' + atraso + ' (venceu em ' + formatBr(due) + ', ' +
            formatBrl(invoice.amount) + ').',
          link: '/faturas/' + invoice.id,
        },
      });
    }

    for (const invoice of dueSoon) {
      const due = utcToIsoDate(invoice.dueDate);
      const days = daysBetween(reference, due);

      desired.push({
        dedupeKey: key(NotificationType.INVOICE_DUE_SOON, invoice.id, user.id),
        userId: user.id,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        payload: {
          type: NotificationType.INVOICE_DUE_SOON,
          // Vence hoje é mais urgente do que vence daqui a uma semana, e a cor
          // do selo precisa refletir isso.
          severity: days === 0 ? NotificationSeverity.WARNING : NotificationSeverity.INFO,
          title: 'Fatura ' + invoice.number + ' ' + relativeDay(days),
          message:
            'Fatura ' + invoice.number + ' do cliente ' + invoice.client.name + ' ' +
            relativeDay(days) + ' (' + formatBr(due) + ', ' + formatBrl(invoice.amount) + ').',
          link: '/faturas/' + invoice.id,
        },
      });
    }

    for (const contract of expiring) {
      if (!contract.endDate) continue;

      const end = utcToIsoDate(contract.endDate);
      const days = daysBetween(reference, end);

      desired.push({
        dedupeKey: key(NotificationType.CONTRACT_EXPIRING, contract.id, user.id),
        userId: user.id,
        contractId: contract.id,
        clientId: contract.clientId,
        payload: {
          type: NotificationType.CONTRACT_EXPIRING,
          severity: days <= 7 ? NotificationSeverity.WARNING : NotificationSeverity.INFO,
          title: 'Contrato ' + contract.number + ' ' + relativeDay(days),
          message:
            'Contrato ' + contract.number + ' do cliente ' + contract.client.name + ' ' +
            relativeDay(days) + ' (' + formatBr(end) + ').',
          link: '/contratos/' + contract.id,
        },
      });
    }
  }

  await persist(desired, recipients);
}

/**
 * Grava o conjunto desejado e descarta o que sobrou.
 *
 * O upsert por dedupeKey faz as duas coisas de uma vez: cria o que falta e
 * ATUALIZA o texto do que já existe. Atualizar importa porque a mensagem é
 * relativa — "vence amanhã" precisa virar "vence hoje" no dia seguinte, e um
 * texto congelado na criação mentiria depois de 24 horas. `readAt` nunca é
 * tocado: reescrever a mensagem não desfaz a leitura de quem já viu o aviso.
 */
async function persist(
  desired: DesiredNotification[],
  recipients: NotificationRecipient[],
): Promise<void> {
  const byId = new Map(recipients.map((user) => [user.id, user]));

  for (const item of desired) {
    const data = {
      userId: item.userId,
      type: item.payload.type,
      severity: item.payload.severity,
      title: item.payload.title,
      message: item.payload.message,
      link: item.payload.link,
      invoiceId: item.invoiceId ?? null,
      contractId: item.contractId ?? null,
      clientId: item.clientId ?? null,
    };

    const saved = await prisma.notification.upsert({
      where: { dedupeKey: item.dedupeKey },
      create: { ...data, dedupeKey: item.dedupeKey, deliveredChannels: [] },
      update: {
        severity: data.severity,
        title: data.title,
        message: data.message,
        link: data.link,
      },
      select: { id: true, deliveredChannels: true },
    });

    const recipient = byId.get(item.userId);
    if (recipient) {
      await dispatch(saved.id, saved.deliveredChannels, item.payload, recipient);
    }
  }

  /**
   * Remove o que deixou de valer.
   *
   * Restrito aos tipos que a varredura administra: um tipo futuro criado por
   * outra origem (um aviso manual, por exemplo) não pode ser apagado por uma
   * varredura que não sabe da existência dele.
   */
  const keep = desired.map((item) => item.dedupeKey);

  await prisma.notification.deleteMany({
    where: {
      type: { in: MANAGED_TYPES },
      ...(keep.length > 0 ? { dedupeKey: { notIn: keep } } : {}),
    },
  });
}

/**
 * Entrega pelos canais ainda não usados para esta notificação.
 *
 * Falha de canal é registrada e engolida: o e-mail não sair não pode impedir o
 * alerta de aparecer no sino, que é o canal que sempre funciona. Só os canais
 * que tiveram sucesso entram em deliveredChannels, então a próxima varredura
 * tenta de novo os que falharam.
 */
async function dispatch(
  notificationId: string,
  alreadyDelivered: string[],
  payload: NotificationPayload,
  recipient: NotificationRecipient,
): Promise<void> {
  const pending = NOTIFICATION_CHANNELS.filter(
    (channel) => channel.isEnabled() && !alreadyDelivered.includes(channel.id),
  );

  if (pending.length === 0) return;

  const delivered: string[] = [];

  for (const channel of pending) {
    try {
      await channel.deliver(payload, recipient);
      delivered.push(channel.id);
    } catch (error) {
      console.error('Falha ao entregar notificação pelo canal ' + channel.id + ':', error);
    }
  }

  if (delivered.length > 0) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { deliveredChannels: { push: delivered } },
    });
  }
}

function key(type: NotificationType, entityId: string, userId: string): string {
  return type + ':' + entityId + ':' + userId;
}

function daysBetween(from: string, to: string): number {
  const diff = isoDateToUtc(to).getTime() - isoDateToUtc(from).getTime();
  return Math.round(diff / 86_400_000);
}

/** "vence hoje" / "vence amanhã" / "vence em 12 dias". */
function relativeDay(days: number): string {
  if (days <= 0) return 'vence hoje';
  if (days === 1) return 'vence amanhã';
  return 'vence em ' + days + ' dias';
}

function formatBr(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return day + '/' + month + '/' + year;
}

function formatBrl(value: { toFixed(digits: number): string }): string {
  return Number(value.toFixed(2)).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  severity: true,
  title: true,
  message: true,
  link: true,
  readAt: true,
  createdAt: true,
  invoiceId: true,
  contractId: true,
  clientId: true,
} as const;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

function toDto(item: NotificationRow) {
  return {
    ...item,
    readAt: item.readAt ? item.readAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
  };
}

export async function listNotifications(userId: string, query: ListNotificationsQuery) {
  // A varredura roda antes da leitura para que o sino nunca mostre um estado
  // velho. O intervalo mínimo impede que isso custe caro no polling.
  await syncNotifications();

  const where: Prisma.NotificationWhereInput = { userId };

  if (query.status === 'unread') where.readAt = null;
  else if (query.status === 'read') where.readAt = { not: null };

  const [total, unreadCount, items] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({
      where,
      /**
       * Não lidas primeiro, depois as mais urgentes, depois as mais recentes.
       *
       * `readAt` ascendente com nulos primeiro é o que põe as não lidas no
       * topo — o que já foi visto não deve empurrar para baixo o que ainda não
       * foi. A severidade ordena alfabeticamente e, por sorte do enum,
       * CRITICAL < INFO < WARNING não serve; por isso ela é reordenada em
       * memória logo abaixo.
       */
      orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: NOTIFICATION_SELECT,
    }),
  ]);

  /**
   * Severidade ordenada por URGÊNCIA, não por alfabeto.
   *
   * O enum do Postgres ordena pela ordem de declaração, que aqui até coincide
   * (CRITICAL, WARNING, INFO), mas depender disso deixaria a lista em ordem
   * errada no dia em que alguém acrescentasse um valor no meio. O desempate é
   * feito aqui, sobre a página já carregada, onde a intenção fica explícita.
   */
  const rank: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

  const ordered = [...items].sort((a, b) => {
    const readDiff = Number(a.readAt !== null) - Number(b.readAt !== null);
    if (readDiff !== 0) return readDiff;

    const severityDiff = (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
    if (severityDiff !== 0) return severityDiff;

    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return {
    items: ordered.map(toDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    /** Total de não lidas do usuário, independente do filtro — é o do selo. */
    unreadCount,
  };
}

export async function markAsRead(userId: string, id: string) {
  const notification = await prisma.notification.findUnique({
    where: { id },
    select: { id: true, userId: true, readAt: true },
  });

  /**
   * Notificação de outro usuário responde 404, não 403.
   *
   * Um 403 confirmaria que o id existe. Como as notificações são pessoais,
   * isso deixaria um usuário sondar a existência de avisos alheios.
   */
  if (!notification || notification.userId !== userId) {
    throw AppError.notFound('Notificação não encontrada.');
  }

  // Já lida: devolve como está, sem reescrever o instante da leitura.
  if (!notification.readAt) {
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  const item = await prisma.notification.findUniqueOrThrow({
    where: { id },
    select: NOTIFICATION_SELECT,
  });

  return toDto(item);
}

export async function markAllAsRead(userId: string): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  return { updated: result.count };
}
