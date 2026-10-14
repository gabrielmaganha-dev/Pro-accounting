import {
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
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { SortableHead } from '@/components/common/SortableHead';
import { SortSelect, type SortOption } from '@/components/common/SortSelect';
import { SummaryTile } from '@/components/common/SummaryTile';
import { TableSkeleton } from '@/components/common/TableSkeleton';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useFinanceEntries, useFinanceExport, useFinanceOverview } from '@/hooks/use-finance';
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

type FinanceSort = NonNullable<FinanceFilters['sort']>;

/** As mesmas colunas ordenáveis do cabeçalho da tabela. */
const SORT_OPTIONS: SortOption<FinanceSort>[] = [
  { column: 'dueDate', label: 'Vencimento' },
  { column: 'client', label: 'Cliente' },
  { column: 'amount', label: 'Valor' },
];

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

  /**
   * "Falhou" só quando não há nada para mostrar. Um refetch em segundo plano
   * que falha deixa a consulta em erro COM os números anteriores em cache, e
   * trocar a tela inteira por uma mensagem de erro esconderia dado válido.
   */
  const overviewFailed = overview.isError && !overview.data;

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
            {periodLabel
              ? `Período: ${periodLabel}`
              : overviewFailed
                ? 'Resumo indisponível no momento'
                : !customReady
                  ? 'Escolha as duas datas do intervalo'
                  : 'Carregando…'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={exportFormat}
            onValueChange={(value) => setExportFormat(value as 'csv' | 'xlsx' | 'pdf')}
          >
            <SelectTrigger
              className="min-w-[150px] flex-1 sm:w-[190px] sm:flex-none"
              aria-label="Formato da exportação"
            >
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
            <Label id="financeiro-periodo" className="text-xs">
              Período
            </Label>
            <div role="group" aria-labelledby="financeiro-periodo" className="flex flex-wrap gap-1.5">
              {PERIOD_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={period === option.value ? 'default' : 'outline'}
                  size="sm"
                  // Sem isto o período ativo existe só como cor de fundo.
                  aria-pressed={period === option.value}
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
              <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:items-center">
                <Input
                  type="date"
                  value={from}
                  onChange={(event) => updateParams({ from: event.target.value, page: '1' })}
                  aria-label="Data inicial"
                />
                <span className="hidden text-xs text-muted-foreground min-[480px]:inline">
                  até
                </span>
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

          {/* "Vencimento" — a ordenação padrão — só tem cabeçalho a partir de
              1280px. Abaixo disso é por aqui que se ordena. */}
          <div className="space-y-1.5 lg:ml-auto xl:hidden">
            <Label className="text-xs">Ordenar faturas por</Label>
            <SortSelect
              options={SORT_OPTIONS}
              sort={sort}
              order={order}
              onChange={(column, nextOrder) =>
                updateParams({ sort: column, order: nextOrder, page: '1' })
              }
              className="w-full sm:w-[270px]"
            />
          </div>

          <div className="space-y-1.5 xl:ml-auto">
            <Label className="text-xs">Situação da fatura</Label>
            <Select
              value={status || ALL}
              onValueChange={(value) => updateParams({ status: value, page: '1' })}
            >
              <SelectTrigger className="w-full sm:w-[190px]" aria-label="Filtrar por situação">
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

      {overviewFailed && (
        <Card>
          <ErrorState
            title="Não foi possível carregar o resumo financeiro"
            description={overview.error instanceof Error ? overview.error.message : undefined}
            onRetry={() => void overview.refetch()}
            isRetrying={overview.isFetching}
          />
        </Card>
      )}

      {/* ---------------- Cards ----------------
          `customReady`: com o período personalizado ainda sem as duas datas,
          as consultas ficam desligadas e nada está sendo buscado. Sem esta
          condição a tela mostrava esqueletos para sempre — e o leitor de tela
          anunciava "Carregando…" sem que nada carregasse. */}
      {customReady && !overviewFailed && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryTile
              label="Receita do mês"
              value={formatCurrency(cards?.revenueThisMonth)}
              hint="Mês corrente — não segue o filtro"
              icon={TrendingUp}
              tone="text-emerald-700"
              isLoading={overview.isPending}
            />
            <SummaryTile
              label="Receita do ano"
              value={formatCurrency(cards?.revenueThisYear)}
              hint="Ano corrente — não segue o filtro"
              icon={TrendingUp}
              tone="text-emerald-700"
              isLoading={overview.isPending}
            />
            <SummaryTile
              label="Total recebido"
              value={formatCurrency(cards?.received)}
              hint={periodLabel ? `No período: ${periodLabel}` : undefined}
              icon={Wallet}
              tone="text-emerald-700"
              isLoading={overview.isPending}
            />
            <SummaryTile
              label="Total faturado"
              value={formatCurrency(cards?.invoiced)}
              hint="Emitido no período, exceto canceladas"
              icon={ReceiptText}
              isLoading={overview.isPending}
            />
            <SummaryTile
              label="Total pendente"
              value={formatCurrency(cards?.pending)}
              hint={
                cards ? `${cards.pendingCount} fatura(s) — saldo atual, todo o período` : undefined
              }
              icon={ReceiptText}
              tone="text-amber-800"
              isLoading={overview.isPending}
            />
            <SummaryTile
              label="Total atrasado"
              value={formatCurrency(cards?.overdue)}
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
        </>
      )}

      {/* ---------------- Gráficos ---------------- */}
      {customReady && !overviewFailed && (
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
      )}

      {/* ---------------- Tabela ---------------- */}
      {customReady && (
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

          {entries.isError && !entries.data ? (
            <ErrorState
              title="Não foi possível carregar as faturas"
              description={entries.error instanceof Error ? entries.error.message : undefined}
              onRetry={() => void entries.refetch()}
              isRetrying={entries.isFetching}
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
              {/* Colunas por largura de tela e ordem iguais às da tela de
                  Faturas: número primeiro, cliente depois. Abaixo de 768px a
                  linha vira duas células — identificação à esquerda, valor,
                  vencimento e situação à direita. */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fatura</TableHead>
                    <SortableHead
                      label="Cliente"
                      column="client"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                      className="hidden md:table-cell"
                    />
                    <SortableHead
                      label="Valor"
                      column="amount"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                      className="text-right max-md:pr-4 md:text-left"
                    />
                    <SortableHead
                      label="Vencimento"
                      column="dueDate"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                      className="hidden xl:table-cell"
                    />
                    <TableHead className="hidden xl:table-cell">Pagamento</TableHead>
                    <TableHead className="hidden md:table-cell">Situação</TableHead>
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
                        {/* Link de verdade: torna a fatura alcançável por teclado
                            e leitor de tela. stopPropagation evita navegar duas
                            vezes (link + clique da linha). */}
                        <Link
                          to={`/faturas/${entry.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="whitespace-nowrap font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          {entry.number}
                        </Link>
                        {entry.contractNumber && (
                          <p className="hidden text-xs text-muted-foreground md:block">
                            {entry.contractNumber}
                          </p>
                        )}
                        <p className="text-sm text-foreground md:hidden">{entry.clientName}</p>
                      </TableCell>

                      <TableCell className="hidden md:table-cell">
                        <p className="max-w-[200px] truncate text-foreground">{entry.clientName}</p>
                      </TableCell>

                      <TableCell className="whitespace-nowrap text-right tabular-nums max-md:pr-4 md:text-left">
                        {formatCurrency(entry.amount)}
                        {Number(entry.paidAmount) > 0 && Number(entry.outstanding) > 0 && (
                          <p className="text-xs text-amber-700">
                            resta {formatCurrency(entry.outstanding)}
                          </p>
                        )}
                        {/* O vencimento só ganha coluna a partir de 1280px. */}
                        <p className="text-xs text-muted-foreground xl:hidden">
                          vence {formatDate(entry.dueDate)}
                        </p>
                        <div className="mt-1 md:hidden">
                          <InvoiceStatusBadge status={entry.status} />
                        </div>
                      </TableCell>

                      <TableCell className="hidden whitespace-nowrap xl:table-cell">
                        {formatDate(entry.dueDate)}
                      </TableCell>

                      <TableCell className="hidden whitespace-nowrap xl:table-cell">
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

                      <TableCell className="hidden md:table-cell">
                        <InvoiceStatusBadge status={entry.status} />
                        {/* Sem a coluna de pagamento (abaixo de 1280px), quando
                            e como o dinheiro entrou vem junto da situação. */}
                        {entry.paymentDate && (
                          <p className="mt-1 text-xs text-muted-foreground xl:hidden">
                            <span className="whitespace-nowrap">
                              pago em {formatDate(entry.paymentDate)}
                            </span>
                            {entry.paymentMethod && (
                              <span className="block">{entry.paymentMethod}</span>
                            )}
                          </p>
                        )}
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
      )}

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
