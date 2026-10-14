import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/services/api';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/services/notification.service';
import type { NotificationFilters } from '@/types/notification';

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (filters: NotificationFilters) => [...notificationKeys.lists(), filters] as const,
};

/**
 * Intervalo de atualização do sino.
 *
 * Sessenta segundos: um alerta de fatura atrasada não precisa chegar em tempo
 * real — a condição muda uma vez por dia, à meia-noite. O que precisa ser
 * rápido é o SUMIÇO do alerta depois que alguém registra o pagamento, e isso
 * não depende do polling: a mutação invalida a consulta na hora.
 *
 * Do lado do servidor a varredura tem o mesmo intervalo mínimo, então este
 * polling não multiplica trabalho de banco.
 */
const POLL_INTERVAL_MS = 60_000;

export function useNotifications(filters: NotificationFilters = {}) {
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: ({ signal }) => listNotifications(filters, signal),
    refetchInterval: POLL_INTERVAL_MS,
    // Sem isto o contador congelaria enquanto a aba estivesse em segundo
    // plano e voltaria desatualizado quando o usuário retornasse.
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
}

function useNotificationInvalidation() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
}

export function useMarkNotificationRead() {
  const invalidate = useNotificationInvalidation();

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void invalidate();
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : 'Não foi possível marcar como lida.',
      );
    },
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useNotificationInvalidation();

  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: (result) => {
      void invalidate();

      // Nada a marcar não é erro nem sucesso digno de alarde — só um aviso
      // discreto de que o clique não tinha o que fazer.
      if (result.updated === 0) {
        toast.info('Não havia notificações não lidas.');
        return;
      }

      toast.success(
        result.updated === 1
          ? '1 notificação marcada como lida.'
          : `${result.updated} notificações marcadas como lidas.`,
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : 'Não foi possível marcar todas como lidas.',
      );
    },
  });
}
