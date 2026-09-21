import {
  ArrowDownAZ,
  ArrowUpAZ,
  Eye,
  FilePlus2,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
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
import { useInvoices } from '@/hooks/use-invoices';
import { INVOICE_STATUS_LABELS } from '@/types/dashboard';
import { INVOICE_STATUS_OPTIONS, type InvoiceListFilters } from '@/types/invoice';
import { formatCurrency, formatDate } from '@/utils/format';
import { maskCurrency, parseCurrency, toCurrencyInput } from '@/utils/mask';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

const PAGE_SIZE = 20;

export function InvoicesListPage() {
  const navigate = useNavigate();

  /**
   * Os filtros vivem na URL, não em estado local.
   *
   * Assim o botão Voltar do navegador funciona, a busca pode ser enviada por
   * link a um colega, e voltar da ficha não perde o filtro aplicado. É também
   * o que permite o painel apontar para "/faturas?status=OVERDUE" e a tela
   * abrir já filtrada.
   */
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const dueFrom = searchParams.get('dueFrom') ?? '';
  const dueTo = searchParams.get('dueTo') ?? '';
  const issueFrom = searchParams.get('issueFrom') ?? '';
  const issueTo = searchParams.get('issueTo') ?? '';
  const minAmount = searchParams.get('minAmount') ?? '';
  const maxAmount = searchParams.get('maxAmount') ?? '';
  const clientId = searchParams.get('clientId') ?? '';
  const contractId = searchParams.get('contractId') ?? '';
  const sort = (searchParams.get('sort') ?? 'dueDate') as NonNullable<InvoiceListFilters['sort']>;
  const order = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc';

  const [searchInput, setSearchInput] = useState(search);
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(dueFrom || dueTo || issueFrom || issueTo || minAmount || maxAmount),
  );

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Campo de busca com atraso: sem isso, cada tecla digitada dispararia uma
  // consulta ao banco.
  useEffect(() => {
    if (searchInput === search) return;

    const timer = setTimeout(() => {
      updateParams({ search: searchInput, page: '1' });
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  function updateParams(changes: Record<string, string>): void {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === ALL) next.delete(key);
      else next.set(key, value);
    }

    setSearchParams(next, { replace: true });
  }

  const filters: InvoiceListFilters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      sort,
      order,
      ...(search ? { search } : {}),
      ...(status ? { status: status as InvoiceListFilters['status'] } : {}),
      ...(clientId ? { clientId } : {}),
      ...(contractId ? { contractId } : {}),
      ...(dueFrom ? { dueFrom } : {}),
      ...(dueTo ? { dueTo } : {}),
      ...(issueFrom ? { issueFrom } : {}),
      ...(issueTo ? { issueTo } : {}),
      ...(minAmount ? { minAmount } : {}),
      ...(maxAmount ? { maxAmount } : {}),
    }),
    [
      page, search, status, clientId, contractId,
      dueFrom, dueTo, issueFrom, issueTo, minAmount, maxAmount, sort, order,
    ],
  );

  const { data, isPending, isFetching, isError, error } = useInvoices(filters);

  const hasActiveFilters = Boolean(
    search || status || clientId || contractId ||
    dueFrom || dueTo || issueFrom || issueTo || minAmount || maxAmount,
  );

  function toggleSort(column: NonNullable<InvoiceListFilters['sort']>): void {
    const nextOrder = sort === column && order === 'asc' ? 'desc' : 'asc';
    updateParams({ sort: column, order: nextOrder, page: '1' });
  }

  /**
   * Total da página corrente, somado em centavos.
   *
   * Responde "quanto vale o que estou vendo" sem uma consulta extra. É o total
   * da PÁGINA, não do filtro inteiro — e o rótulo diz isso, porque um número
   * ambíguo num sistema financeiro é pior que nenhum.
   */
  const pageTotal = useMemo(() => {
    if (!data) return '0.00';
    const cents = data.items.reduce(
      (sum, invoice) => sum + Math.round(Number(invoice.amount) * 100),
      0,
    );
    return (cents / 100).toFixed(2);
  }, [data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Faturas
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? `${data.total} ${data.total === 1 ? 'fatura encontrada' : 'faturas encontradas'}`
              : 'Carregando…'}
          </p>
        </div>

        <Button asChild>
          <Link to="/faturas/nova">
            <Plus />
            Nova fatura
          </Link>
        </Button>
      </div>

      {/* ---------------- Filtros ---------------- */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Buscar por número, descrição, cliente ou contrato…"
                className="pl-9"
                aria-label="Buscar faturas"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={status || ALL}
                onValueChange={(value) => updateParams({ status: value, page: '1' })}
              >
                <SelectTrigger className="w-[170px]" aria-label="Filtrar por situação">
                  <SlidersHorizontal className="size-4 text-muted-foreground" />
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

              <Button
                variant={showAdvanced ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <SlidersHorizontal />
                Período e valor
              </Button>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
                >
                  <X />
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Período e valor ficam recolhidos por padrão: são seis campos que
              quase ninguém usa no dia a dia, e deixá-los sempre visíveis
              tornaria a barra de filtros mais alta que a própria tabela. */}
          {showAdvanced && (
            <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
              <DateRangeField
                label="Vencimento"
                from={dueFrom}
                to={dueTo}
                onChange={(from, to) => updateParams({ dueFrom: from, dueTo: to, page: '1' })}
              />

              <DateRangeField
                label="Emissão"
                from={issueFrom}
                to={issueTo}
                onChange={(from, to) =>
                  updateParams({ issueFrom: from, issueTo: to, page: '1' })
                }
              />

              <AmountRangeField
                min={minAmount}
                max={maxAmount}
                onChange={(min, max) =>
                  updateParams({ minAmount: min, maxAmount: max, page: '1' })
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Tabela ---------------- */}
      <Card className="overflow-hidden">
        {isError ? (
          <EmptyState
            title="Não foi possível carregar as faturas"
            description={error instanceof Error ? error.message : undefined}
            icon={ReceiptText}
          />
        ) : isPending ? (
          <TableSkeleton />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'Nenhuma fatura encontrada' : 'Nenhuma fatura emitida'}
            description={
              hasActiveFilters
                ? 'Tente outro termo de busca ou limpe os filtros aplicados.'
                : 'Emita a primeira fatura para começar a controlar os recebimentos.'
            }
            icon={FilePlus2}
            action={
              hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
                >
                  Limpar filtros
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link to="/faturas/nova">
                    <Plus />
                    Emitir fatura
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortButton
                      label="Número"
                      column="number"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      label="Cliente"
                      column="client"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">Contrato</TableHead>
                  <TableHead className="hidden lg:table-cell">Descrição</TableHead>
                  <TableHead>
                    <SortButton
                      label="Valor"
                      column="amount"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">
                    <SortButton
                      label="Emissão"
                      column="issueDate"
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
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data?.items.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/faturas/${invoice.id}`)}
                  >
                    <TableCell className="whitespace-nowrap font-medium">
                      {invoice.number}
                    </TableCell>

                    <TableCell>
                      <p className="max-w-[180px] truncate text-foreground">
                        {invoice.client.name}
                      </p>
                      <p className="max-w-[180px] truncate text-xs text-muted-foreground lg:hidden">
                        {invoice.description ?? 'Sem descrição'}
                      </p>
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap xl:table-cell">
                      {invoice.contract ? (
                        invoice.contract.number
                      ) : (
                        <span className="text-muted-foreground">Avulsa</span>
                      )}
                    </TableCell>

                    <TableCell className="hidden max-w-[220px] truncate lg:table-cell">
                      {invoice.description ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatCurrency(invoice.amount)}
                      {/* Pagamento parcial precisa aparecer aqui: sem isso, uma
                          fatura de R$ 1.200 com R$ 800 pagos parece intocada. */}
                      {Number(invoice.paidAmount) > 0 &&
                        Number(invoice.outstanding) > 0 && (
                          <p className="text-xs text-amber-700">
                            resta {formatCurrency(invoice.outstanding)}
                          </p>
                        )}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap xl:table-cell">
                      {formatDate(invoice.issueDate)}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {formatDate(invoice.dueDate)}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      {invoice.lastPaymentDate ? (
                        formatDate(invoice.lastPaymentDate)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <InvoiceStatusBadge
                        status={invoice.status}
                        daysOverdue={invoice.daysOverdue}
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      {/* stopPropagation: sem ele, clicar em Editar abriria a
                          ficha (clique da linha) e logo em seguida a edição. */}
                      <div
                        className="flex justify-end gap-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button variant="ghost" size="icon" asChild aria-label="Ver detalhes">
                          <Link to={`/faturas/${invoice.id}`}>
                            <Eye />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild aria-label="Editar fatura">
                          <Link to={`/faturas/${invoice.id}/editar`}>
                            <Pencil />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
              <p className="text-xs text-muted-foreground">
                Soma desta página:{' '}
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(pageTotal)}
                </span>
              </p>
            </div>

            {data && (
              <Pagination
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                totalPages={data.totalPages}
                onPageChange={(next) => updateParams({ page: String(next) })}
                disabled={isFetching}
              />
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DateRangeField({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={from}
          onChange={(event) => onChange(event.target.value, to)}
          aria-label={`${label} — de`}
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => onChange(from, event.target.value)}
          aria-label={`${label} — até`}
        />
      </div>
    </div>
  );
}

/**
 * Faixa de valor.
 *
 * O estado local existe porque o campo é mascarado: a URL guarda `1500.00` e a
 * tela mostra `1.500,00`. Sem o intermediário, cada tecla reescreveria a URL e
 * a máscara brigaria com o cursor.
 */
function AmountRangeField({
  min,
  max,
  onChange,
}: {
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}) {
  const [minInput, setMinInput] = useState(toCurrencyInput(min));
  const [maxInput, setMaxInput] = useState(toCurrencyInput(max));

  useEffect(() => {
    setMinInput(toCurrencyInput(min));
    setMaxInput(toCurrencyInput(max));
  }, [min, max]);

  function commit(nextMin: string, nextMax: string): void {
    onChange(parseCurrency(nextMin), parseCurrency(nextMax));
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Valor</Label>
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          placeholder="mínimo"
          className="tabular-nums"
          value={minInput}
          onChange={(event) => setMinInput(maskCurrency(event.target.value))}
          onBlur={() => commit(minInput, maxInput)}
          aria-label="Valor mínimo"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          inputMode="numeric"
          placeholder="máximo"
          className="tabular-nums"
          value={maxInput}
          onChange={(event) => setMaxInput(maskCurrency(event.target.value))}
          onBlur={() => commit(minInput, maxInput)}
          aria-label="Valor máximo"
        />
      </div>
    </div>
  );
}

interface SortButtonProps {
  label: string;
  column: NonNullable<InvoiceListFilters['sort']>;
  activeColumn: string;
  order: 'asc' | 'desc';
  onClick: (column: NonNullable<InvoiceListFilters['sort']>) => void;
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
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
