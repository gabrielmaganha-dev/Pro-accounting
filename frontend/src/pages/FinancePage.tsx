import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarRange,
  Download,
  Loader2,
  ReceiptText,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ChartCard } from '@/components/dashboard/ChartCard';
import { InvoiceStatusChart } from '@/components/dashboard/InvoiceStatusChart';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { FinanceRevenueChart } from '@/components/finance/FinanceRevenueChart';
import { ReceiptsByMethodChart } from '@/components/finance/ReceiptsByMethodChart';
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFinanceEntries, useFinanceExport, useFinanceOverview } from '@/hooks/use-finance';
import { cn } from '@/lib/utils';
import { INVOICE_STATUS_LABELS } from '@/types/dashboard';
import {
  PERIOD_OPTIONS,
  type FinanceFilters,
  type FinancePeriod,
} from '@/types/finance';
import { INVOICE_STATUS_OPTIONS } from '@/types/invoice';
import { formatCurrency, formatDate } from '@/utils/format';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

const PAGE_SIZE = 20;

/**
 * Visão financeira do escritório.
 *
 * Restrita a administradores — o guard de rota barra a navegação e o item some
 * do menu, mas quem garante é `authorize('ADMIN')` na API: os dois primeiros
 * rodam no navegador do usuário.
 *
 * Nenhum número desta tela é somado aqui. Todos vêm calculados da API, em
 * `numeric` do PostgreSQL, por dois motivos: somar dinheiro em ponto flutuante
 * erra centavos, e dois navegadores com relógios diferentes discordariam sobre
 * o que é "este mês".
 */
export function FinancePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const period = (searchParams.get('period') ?? 'month') as FinancePeriod;
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const status = searchParams.get('status') ?? '';
  const page = Number(searchParams.get('page') ?? '1');
  const sort = (searchParams.get('sort') ?? 'dueDate') as NonNullable<FinanceFilters['sort']>;
  const order = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc';

  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'pdf'>('csv');

  function updateParams(changes: Record<string, string>): void {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === ALL) next.delete(key);
      else next.set(key, value);
    }

    setSearchParams(next, { replace: true });
  }

  /**
   * O período personalizado só é enviado quando as DUAS datas estão
   * preenchidas. Sem isso, a API recusaria com erro de validação enquanto a
   * pessoa ainda está escolhendo a segunda data — e a tela mostraria um erro
   * vermelho no meio do preenchimento normal.
   */
  const customReady = period !== 'custom' || Boolean(from && to);

  const periodFilters: FinanceFilters = useMemo(
    () => ({
      period,
      ...(period === 'custom' && from ? { from } : {}),
      ...(period === 'custom' && to ? { to } : {}),
    }),
    [period, from, to],
  );

  const entryFilters: FinanceFilters = useMemo(
    () => ({
      ...periodFilters,
      page,
      pageSize: PAGE_SIZE,
      sort,
      order,
      ...(status ? { status: status as FinanceFilters['status'] } : {}),
    }),
    [periodFilters, page, sort, order, status],
  );

  const overview = useFinanceOverview(periodFilters, customReady);
  const entries = useFinanceEntries(entryFilters, customReady);
  const exportMutation = useFinanceExport();

  function toggleSort(column: NonNullable<FinanceFilters['sort']>): void {
    const nextOrder = sort === column && order === 'asc' ? 'desc' : 'asc';
    updateParams({ sort: column, order: nextOrder, page: '1' });
  }

  const cards = overview.data?.cards;
  const periodLabel = overview.data?.period.label ?? '';

  return (
    <div className="space-y-5">
      {/* ---------------- Cabeçalho ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Financeiro
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {periodLabel ? `Período: ${periodLabel}` : 'Carregando…'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={exportFormat}
            onValueChange={(value) => setExportFormat(value as 'csv' | 'xlsx' | 'pdf')}
          >
            <SelectTrigger className="w-[130px]" aria-label="Formato da exportação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv">CSV</SelectItem>
              {/* Anunciados porque estão previstos; a API responde 501 com a
                  mensagem dizendo que o CSV já está disponível. */}
              <SelectItem value="xlsx">Excel (em breve)</SelectItem>
              <SelectItem value="pdf">PDF (em breve)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() =>
              exportMutation.mutate({
                ...periodFilters,
                format: exportFormat,
                ...(status ? { status: status as FinanceFilters['status'] } : {}),
              })
            }
            disabled={exportMutation.isPending || !customReady}
          >
            {exportMutation.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            Exportar
          </Button>
        </div>
      </div>

      {/* ---------------- Período ---------------- */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Período</Label>
            <div className="flex flex-wrap gap-1.5">
              {PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={period === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateParams({ period: option.value, page: '1' })}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {period === 'custom' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Intervalo</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(event) => updateParams({ from: event.target.value, page: '1' })}
                  aria-label="Data inicial"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(event) => updateParams({ to: event.target.value, page: '1' })}
                  aria-label="Data final"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5 lg:ml-auto">
            <Label className="text-xs">Situação da fatura</Label>
            <Select
              value={status || ALL}
              onValueChange={(value) => updateParams({ status: value, page: '1' })}
            >
              <SelectTrigger className="w-[180px]" aria-label="Filtrar por situação">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas situações</SelectItem>
                {INVOICE_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {INVOICE_STATUS_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {period === 'custom' && !customReady && (
        <Card>
          <EmptyState
            title="Escolha as duas datas"
            description="O período personalizado precisa da data inicial e da final para calcular os totais."
            icon={CalendarRange}
            compact
          />
        </Card>
      )}

      {/* ---------------- Cards ---------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          label="Receita do mês"
          value={cards?.revenueThisMonth}
          hint="Mês corrente — não segue o filtro"
          icon={TrendingUp}
          tone="text-emerald-700"
          isLoading={overview.isPending}
        />
        <SummaryCard
          label="Receita do ano"
          value={cards?.revenueThisYear}
          hint="Ano corrente — não segue o filtro"
          icon={TrendingUp}
          tone="text-emerald-700"
          isLoading={overview.isPending}
        />
        <SummaryCard
          label="Total recebido"
          value={cards?.received}
          hint={periodLabel ? `No período: ${periodLabel}` : undefined}
          icon={Wallet}
          tone="text-emerald-700"
          isLoading={overview.isPending}
        />
        <SummaryCard
          label="Total faturado"
          value={cards?.invoiced}
          hint="Emitido no período, exceto canceladas"
          icon={ReceiptText}
          isLoading={overview.isPending}
        />
        <SummaryCard
          label="Total pendente"
          value={cards?.pending}
          hint={
            cards ? `${cards.pendingCount} fatura(s) — saldo atual, todo o período` : undefined
          }
          icon={ReceiptText}
          tone="text-amber-800"
          isLoading={overview.isPending}
        />
        <SummaryCard
          label="Total atrasado"
          value={cards?.overdue}
          hint={
            cards ? `${cards.overdueCount} fatura(s) — saldo atual, todo o período` : undefined
          }
          icon={ReceiptText}
          tone="text-red-700"
          isLoading={overview.isPending}
        />
      </div>

      {/* Os dois últimos cards são POSIÇÃO DE HOJE, não recorte do período.
          Dizer isso evita a leitura errada mais provável da tela — somar
          "recebido no mês" com "atrasado" como se fossem o mesmo intervalo. */}
      <p className="text-xs text-muted-foreground">
        Pendente e atrasado mostram o saldo em aberto <strong>de hoje</strong>, de todas as
        faturas — não apenas as do período selecionado. Recortá-los por período responderia
        outra pergunta: "o que venceu naquele intervalo e continua em aberto".
      </p>

      {/* ---------------- Gráficos ---------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Receita"
          description={
            overview.data?.granularity === 'day'
              ? 'Recebimentos por dia no período'
              : 'Recebimentos por mês no período'
          }
          isLoading={overview.isPending}
          isEmpty={overview.data?.revenueSeries.every((point) => Number(point.total) === 0)}
          emptyTitle="Nenhum recebimento no período"
        >
          {overview.data && (
            <FinanceRevenueChart
              data={overview.data.revenueSeries}
              granularity={overview.data.granularity}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Recebimentos por forma"
          description="Por onde o dinheiro entrou no período"
          isLoading={overview.isPending}
          isEmpty={overview.data?.receiptsByMethod.length === 0}
          emptyTitle="Nenhum recebimento no período"
        >
          {overview.data && (
            <ReceiptsByMethodChart
              data={overview.data.receiptsByMethod}
              total={overview.data.cards.received}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Faturas"
          description="Emitidas no período, pela situação atual"
          isLoading={overview.isPending}
          isEmpty={overview.data?.invoicesByStatus.every((slice) => slice.count === 0)}
          emptyTitle="Nenhuma fatura emitida no período"
          className="xl:col-span-2"
        >
          {overview.data && <InvoiceStatusChart data={overview.data.invoicesByStatus} />}
        </ChartCard>
      </div>

      {/* ---------------- Tabela ---------------- */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">Faturas do período</p>
          {entries.data && entries.data.total > 0 && (
            <p className="text-xs text-muted-foreground">
              {entries.data.total} fatura(s) · total{' '}
              <span className="font-medium tabular-nums text-foreground">
                {formatCurrency(entries.data.totalAmount)}
              </span>
            </p>
          )}
        </div>

        {entries.isError ? (
          <EmptyState
            title="Não foi possível carregar as faturas"
            description={entries.error instanceof Error ? entries.error.message : undefined}
            icon={ReceiptText}
          />
        ) : entries.isPending ? (
          <TableSkeleton />
        ) : entries.data && entries.data.items.length === 0 ? (
          <EmptyState
            title="Nenhuma fatura no período"
            description="Troque o período ou a situação para ver outros lançamentos."
            icon={ReceiptText}
            compact
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortButton
                      label="Cliente"
                      column="client"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                    />
                  </TableHead>
                  <TableHead>Fatura</TableHead>
                  <TableHead>
                    <SortButton
                      label="Valor"
                      column="amount"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      label="Vencimento"
                      column="dueDate"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Pagamento</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {entries.data?.items.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/faturas/${entry.id}`)}
                  >
                    <TableCell>
                      <p className="max-w-[200px] truncate text-foreground">{entry.clientName}</p>
                      {entry.contractNumber && (
                        <p className="text-xs text-muted-foreground">{entry.contractNumber}</p>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap font-medium">
                      {entry.number}
                    </TableCell>

                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatCurrency(entry.amount)}
                      {Number(entry.paidAmount) > 0 && Number(entry.outstanding) > 0 && (
                        <p className="text-xs text-amber-700">
                          resta {formatCurrency(entry.outstanding)}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {formatDate(entry.dueDate)}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      {entry.paymentDate ? (
                        <>
                          {formatDate(entry.paymentDate)}
                          {entry.paymentMethod && (
                            <p className="text-xs text-muted-foreground">{entry.paymentMethod}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <InvoiceStatusBadge status={entry.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {entries.data && (
              <Pagination
                page={entries.data.page}
                pageSize={entries.data.pageSize}
                total={entries.data.total}
                totalPages={entries.data.totalPages}
                onPageChange={(next) => updateParams({ page: String(next) })}
                disabled={entries.isFetching}
              />
            )}
          </>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Precisa do detalhe de cada recebimento?{' '}
        <Link to="/pagamentos" className="font-medium text-brand-700 underline-offset-2 hover:underline">
          Histórico de pagamentos
        </Link>
        .
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  isLoading,
}: {
  label: string;
  value: string | undefined;
  hint?: string;
  icon: typeof Wallet;
  tone?: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>

        {isLoading || value === undefined ? (
          <Skeleton className="mt-2 h-7 w-32" />
        ) : (
          <p className={cn('mt-1 truncate text-xl font-semibold tabular-nums', tone ?? 'text-foreground')}>
            {formatCurrency(value)}
          </p>
        )}

        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

interface SortButtonProps {
  label: string;
  column: NonNullable<FinanceFilters['sort']>;
  activeColumn: string;
  order: 'asc' | 'desc';
  onClick: (column: NonNullable<FinanceFilters['sort']>) => void;
}

function SortButton({ label, column, activeColumn, order, onClick }: SortButtonProps) {
  const isActive = activeColumn === column;

  return (
    <button
      type="button"
      onClick={() => onClick(column)}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground"
      aria-label={`Ordenar por ${label}`}
    >
      {label}
      {isActive &&
        (order === 'asc' ? (
          <ArrowUpAZ className="size-3.5" aria-hidden="true" />
        ) : (
          <ArrowDownAZ className="size-3.5" aria-hidden="true" />
        ))}
    </button>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
