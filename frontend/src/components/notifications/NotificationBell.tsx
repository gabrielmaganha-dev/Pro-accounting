import { AlertTriangle, Bell, CalendarClock, CheckCheck, Clock, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';
import {
  NOTIFICATION_TYPE_LABELS,
  type AppNotification,
  type NotificationSeverity,
} from '@/types/notification';
import { formatRelativeTime } from '@/utils/format';

/**
 * Sino de notificações.
 *
 * Quantas mostrar de uma vez: dez. O painel é para agir, não para navegar —
 * quem tem trinta faturas atrasadas precisa da tela de Faturas com o filtro
 * "Atrasadas", não de uma lista rolante no cabeçalho. O rodapé diz onde ver o
 * resto.
 */
const PANEL_SIZE = 10;

const SEVERITY_STYLES: Record<
  NotificationSeverity,
  { icon: typeof AlertTriangle; dot: string; text: string }
> = {
  CRITICAL: { icon: AlertTriangle, dot: 'bg-red-600', text: 'text-red-700' },
  WARNING: { icon: Clock, dot: 'bg-amber-600', text: 'text-amber-700' },
  INFO: { icon: CalendarClock, dot: 'bg-brand-600', text: 'text-brand-700' },
};

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data, isPending } = useNotifications({ page: 1, pageSize: PANEL_SIZE });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = data?.unreadCount ?? 0;
  const plural = unread === 1 ? 'lida' : 'lidas';

  /**
   * Abrir a notificação marca como lida e navega.
   *
   * Marcar sem esperar a resposta: o usuário já está indo para outra tela, e
   * segurar a navegação por causa de um PATCH que quase nunca falha tornaria o
   * clique lento sem nenhum ganho. Se falhar, o toast avisa e o item continua
   * não lido — que é o estado verdadeiro.
   */
  function handleOpen(notification: AppNotification): void {
    if (!notification.readAt) markRead.mutate(notification.id);

    setOpen(false);
    if (notification.link) navigate(notification.link);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? 'Notificações: ' + unread + ' não ' + plural : 'Notificações'}
        >
          <Bell className="size-5" />

          {/* O número, não apenas um ponto: "3 pendências" e "40 pendências"
              exigem reações diferentes, e um ponto colorido trata as duas
              como iguais. Acima de 9 vira 9+ para não alargar o selo. */}
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-4 text-white"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <DropdownMenuLabel className="p-0">
            Notificações
            {unread > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {unread} não {plural}
              </span>
            )}
          </DropdownMenuLabel>

          {/* Item de menu, não botão solto: dentro de um menu o Radix cancela o
              Tab e só as setas andam — e elas só param em itens. Como botão
              comum, "Marcar todas" e as próprias notificações eram
              inalcançáveis por teclado. */}
          {unread > 0 && (
            <DropdownMenuItem
              className="h-8 shrink-0 gap-1.5 px-2 py-0 text-xs font-medium [&_svg]:size-3.5"
              disabled={markAll.isPending}
              onSelect={(event) => {
                // Sem isto o Radix fecharia o menu ao escolher, e o usuário não
                // veria a lista passar toda para o estado lido.
                event.preventDefault();
                markAll.mutate();
              }}
            >
              {markAll.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
              Marcar todas
            </DropdownMenuItem>
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />

        {isPending ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-sm font-medium text-foreground">Nada pendente</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Faturas atrasadas, vencimentos próximos e contratos a renovar aparecem aqui.
            </p>
          </div>
        ) : (
          <div className="max-h-[22rem] overflow-y-auto">
            {data.items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onOpen={handleOpen}
                onMarkRead={(id) => markRead.mutate(id)}
              />
            ))}
          </div>
        )}

        {data && data.total > data.items.length && (
          <>
            <DropdownMenuSeparator className="m-0" />
            <p className="px-3 py-2 text-center text-xs text-muted-foreground">
              Exibindo {data.items.length} de {data.total}. Use os filtros de Faturas e
              Contratos para ver o resto.
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationRow({
  notification,
  onOpen,
  onMarkRead,
}: {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
  onMarkRead: (id: string) => void;
}) {
  const { icon: Icon, dot, text } = SEVERITY_STYLES[notification.severity];
  const isUnread = notification.readAt === null;

  return (
    // Cada notificação é um item do menu: as setas andam entre elas e o Enter
    // abre — o mesmo que o clique fazia. Antes eram <button> comuns, que o
    // menu do Radix não deixa focar.
    <DropdownMenuItem
      onSelect={() => onOpen(notification)}
      className={cn(
        'items-start gap-2.5 rounded-none border-b border-border px-3 py-2.5 last:border-0',
        isUnread && 'bg-brand-50/40',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', text)}
      >
        <Icon />
      </span>

      <div className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {/* O ponto acompanha o rótulo, nunca aparece sozinho: a urgência
              não pode depender apenas de cor. */}
          {isUnread && <span aria-hidden="true" className={cn('size-1.5 rounded-full', dot)} />}
          {NOTIFICATION_TYPE_LABELS[notification.type]}
        </p>

        <p
          className={cn(
            'mt-0.5 text-sm leading-snug text-foreground',
            isUnread ? 'font-medium' : 'font-normal',
          )}
        >
          {notification.message}
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>

      {isUnread && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 touch:size-9"
          aria-label="Marcar como lida"
          title="Marcar como lida"
          // Atalho de mouse. Pelo teclado, abrir a notificação já a marca
          // como lida — por isso o botão fica fora da ordem de foco.
          tabIndex={-1}
          onClick={(event) => {
            // stopPropagation: sem ele o clique subiria até o item do menu e
            // abriria a notificação em vez de só marcá-la.
            event.preventDefault();
            event.stopPropagation();
            onMarkRead(notification.id);
          }}
        >
          <CheckCheck />
        </Button>
      )}
    </DropdownMenuItem>
  );
}
