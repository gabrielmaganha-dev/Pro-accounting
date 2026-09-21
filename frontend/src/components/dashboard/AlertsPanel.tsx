import { AlertTriangle, CalendarClock, CalendarX2, CheckCircle2, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AlertContractItem, AlertInvoiceItem, DashboardAlerts } from '@/types/dashboard';
import { formatCurrency, formatDate } from '@/utils/format';

interface AlertsPanelProps {
  alerts: DashboardAlerts | undefined;
  isLoading: boolean;
}

type Severity = 'critical' | 'warning' | 'info';

const SEVERITY_STYLES: Record<Severity, { icon: string; badge: string }> = {
  critical: { icon: 'bg-red-50 text-red-600', badge: 'bg-red-100 text-red-700' },
  warning: { icon: 'bg-amber-50 text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  info: { icon: 'bg-brand-50 text-brand-600', badge: 'bg-brand-100 text-brand-700' },
};

/**
 * Painel de alertas.
 *
 * Ordenado por urgência decrescente — vencidas primeiro, contratos por
 * último. Num painel de alertas a ordem é o próprio conteúdo: quem abre o
 * sistema de manhã precisa bater o olho e ver o que já está atrasado, não
 * caçar isso no meio de avisos de prazo confortável.
 *
 * Todos os números vêm calculados do backend. O componente não soma nada.
 */
export function AlertsPanel({ alerts, isLoading }: AlertsPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Alertas</CardTitle>
          <CardDescription>Pendências que precisam de atenção</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-16 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!alerts) return null;

  const totalAlerts =
    alerts.overdueInvoices.count +
    alerts.dueTodayInvoices.count +
    alerts.dueSoonInvoices.count +
    alerts.expiringContracts.count;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Alertas</CardTitle>
        <CardDescription>
          {totalAlerts === 0
            ? 'Nenhuma pendência no momento'
            : `${totalAlerts} ${totalAlerts === 1 ? 'item precisa' : 'itens precisam'} de atenção`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {totalAlerts === 0 ? (
          // Estado "tudo certo" — visualmente distinto de "falhou ao
          // carregar". Um painel de alertas vazio é boa notícia e deve
          // parecer boa notícia.
          <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
            <CheckCircle2 className="size-8 text-emerald-600" aria-hidden="true" />
            <p className="text-sm font-medium text-emerald-900">Tudo em dia</p>
            <p className="text-xs text-emerald-700">
              Nenhuma fatura vencida e nenhum contrato perto do término.
            </p>
          </div>
        ) : (
          <>
            <AlertSection
              icon={AlertTriangle}
              severity="critical"
              title="Faturas vencidas"
              count={alerts.overdueInvoices.count}
              amount={alerts.overdueInvoices.amount}
              items={alerts.overdueInvoices.items}
              renderMeta={(item) => `venceu ${formatDate(item.dueDate)} · há ${item.daysOverdue} dia(s)`}
            />

            <AlertSection
              icon={Clock}
              severity="warning"
              title="Vencem hoje"
              count={alerts.dueTodayInvoices.count}
              amount={alerts.dueTodayInvoices.amount}
              items={alerts.dueTodayInvoices.items}
              renderMeta={() => 'vence hoje'}
            />

            <AlertSection
              icon={CalendarClock}
              severity="info"
              title="Vencem em até 7 dias"
              count={alerts.dueSoonInvoices.count}
              amount={alerts.dueSoonInvoices.amount}
              items={alerts.dueSoonInvoices.items}
              renderMeta={(item) =>
                `vence ${formatDate(item.dueDate)} · em ${Math.abs(item.daysOverdue)} dia(s)`
              }
            />

            <ContractAlertSection
              count={alerts.expiringContracts.count}
              items={alerts.expiringContracts.items}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface AlertSectionProps {
  icon: LucideIcon;
  severity: Severity;
  title: string;
  count: number;
  amount: string;
  items: AlertInvoiceItem[];
  renderMeta: (item: AlertInvoiceItem) => string;
}

function AlertSection({
  icon: Icon,
  severity,
  title,
  count,
  amount,
  items,
  renderMeta,
}: AlertSectionProps) {
  // Grupo vazio não vira linha "0" — encheria o painel de nada.
  if (count === 0) return null;

  const styles = SEVERITY_STYLES[severity];

  return (
    <section className="rounded-lg border border-border">
      <header className="flex items-center gap-3 px-3 py-2.5">
        <span
          aria-hidden="true"
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', styles.icon)}
        >
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(amount)} em aberto</p>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
            styles.badge,
          )}
        >
          {count}
        </span>
      </header>

      <ul className="divide-y divide-border border-t border-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{item.clientName}</p>
              <p className="truncate text-muted-foreground">
                {item.number} · {renderMeta(item)}
              </p>
            </div>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {formatCurrency(item.amount)}
            </span>
          </li>
        ))}

        {/* O backend limita a 5 itens por grupo. Sem esta linha, um escritório
            com 40 faturas vencidas veria 5 e acharia que são só 5. */}
        {count > items.length && (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            + {count - items.length} não exibida(s)
          </li>
        )}
      </ul>
    </section>
  );
}

function ContractAlertSection({ count, items }: { count: number; items: AlertContractItem[] }) {
  if (count === 0) return null;

  return (
    <section className="rounded-lg border border-border">
      <header className="flex items-center gap-3 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700"
        >
          <CalendarX2 className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">Contratos a vencer</p>
          <p className="text-xs text-muted-foreground">Nos próximos 30 dias</p>
        </div>

        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-800">
          {count}
        </span>
      </header>

      <ul className="divide-y divide-border border-t border-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{item.clientName}</p>
              <p className="truncate text-muted-foreground">
                {item.number} · termina {formatDate(item.endDate)} · em {item.daysUntilExpiry} dia(s)
              </p>
            </div>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {formatCurrency(item.monthlyValue)}/mês
            </span>
          </li>
        ))}

        {count > items.length && (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            + {count - items.length} não exibido(s)
          </li>
        )}
      </ul>
    </section>
  );
}
