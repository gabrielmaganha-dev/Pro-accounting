import { FileText, ReceiptText, UserPlus, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  PAYMENT_METHOD_LABELS,
  type DashboardRecentActivity,
} from '@/types/dashboard';
import { formatCpfCnpj, formatCurrency, formatDateTime, formatRelativeTime } from '@/utils/format';

interface RecentActivityProps {
  activity: DashboardRecentActivity | undefined;
  isLoading: boolean;
}

interface ActivityEntry {
  id: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  detail: string;
  amount?: string;
  createdAt: string;
}

const MAX_ENTRIES = 8;

/**
 * Atividade recente.
 *
 * Os quatro tipos (cliente, contrato, fatura, pagamento) são intercalados em
 * UMA linha do tempo ordenada por data, em vez de quatro listas paralelas.
 *
 * O motivo é prático: quatro listas separadas obrigam o usuário a comparar
 * datas entre colunas para descobrir o que aconteceu por último, e no celular
 * viram quatro blocos empilhados que ninguém rola até o fim. Uma linha do
 * tempo responde direto "o que aconteceu de novo no escritório".
 */
export function RecentActivity({ activity, isLoading }: RecentActivityProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Atividade recente</CardTitle>
          <CardDescription>Últimos lançamentos do escritório</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const entries = activity ? buildTimeline(activity) : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Atividade recente</CardTitle>
        <CardDescription>Últimos lançamentos do escritório</CardDescription>
      </CardHeader>

      <CardContent>
        {entries.length === 0 ? (
          <EmptyState
            title="Nenhum lançamento ainda"
            description="Cadastre um cliente e crie o primeiro contrato para ver a movimentação aqui."
            icon={UserPlus}
            compact
          />
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    entry.tone,
                  )}
                >
                  <entry.icon className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{entry.detail}</p>
                </div>

                <div className="shrink-0 text-right">
                  {entry.amount && (
                    <p className="text-sm font-medium tabular-nums text-foreground">
                      {entry.amount}
                    </p>
                  )}
                  {/* Data absoluta no title: "há 3 dias" é melhor para ler de
                      relance, mas quem precisa conferir um lançamento precisa
                      do dia e da hora exatos. */}
                  <p className="text-xs text-muted-foreground" title={formatDateTime(entry.createdAt)}>
                    {formatRelativeTime(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function buildTimeline(activity: DashboardRecentActivity): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    ...activity.clients.map((client) => ({
      id: `client-${client.id}`,
      icon: UserPlus,
      tone: 'bg-brand-50 text-brand-600',
      title: 'Cliente cadastrado',
      detail: `${client.name} · ${formatCpfCnpj(client.cpfCnpj)}`,
      createdAt: client.createdAt,
    })),

    ...activity.contracts.map((contract) => ({
      id: `contract-${contract.id}`,
      icon: FileText,
      tone: 'bg-slate-100 text-slate-600',
      title: 'Contrato criado',
      detail: `${contract.number} · ${contract.clientName}`,
      amount: `${formatCurrency(contract.monthlyValue)}/mês`,
      createdAt: contract.createdAt,
    })),

    ...activity.invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      icon: ReceiptText,
      tone: 'bg-amber-50 text-amber-700',
      title: 'Fatura emitida',
      detail: `${invoice.number} · ${invoice.clientName}`,
      amount: formatCurrency(invoice.amount),
      createdAt: invoice.createdAt,
    })),

    ...activity.payments.map((payment) => ({
      id: `payment-${payment.id}`,
      icon: Wallet,
      tone: 'bg-emerald-50 text-emerald-600',
      title: 'Pagamento registrado',
      detail: `${payment.invoiceNumber} · ${payment.clientName} · ${PAYMENT_METHOD_LABELS[payment.paymentMethod]} · por ${payment.registeredByName}`,
      amount: formatCurrency(payment.amount),
      createdAt: payment.createdAt,
    })),
  ];

  return entries
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_ENTRIES);
}
