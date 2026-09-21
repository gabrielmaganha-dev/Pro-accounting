import {
  ArrowDownAZ,
  ArrowUpAZ,
  CircleDollarSign,
  Search,
  SlidersHorizontal,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { Badge } from '@/components/ui/badge';
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
import { usePayments } from '@/hooks/use-payments';
import { PAYMENT_METHOD_LABELS } from '@/types/dashboard';
import { PAYMENT_METHOD_OPTIONS } from '@/types/invoice';
import type { PaymentListFilters } from '@/types/payment';
import { formatCpfCnpj, formatCurrency, formatDate } from '@/utils/format';
import { maskCurrency, parseCurrency, toCurrencyInput } from '@/utils/mask';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

const PAGE_SIZE = 20;

/**
 * Histórico de pagamentos.
 *
 * Responde uma pergunta que a aba de pagamentos de uma fatura não responde:
 * "o que entrou no escritório". É a visão de CAIXA — usada para fechar o dia,
 * conferir o extrato bancário contra o sistema e auditar o que cada pessoa
 * lançou. Por isso a tela é de leitura: pagamento nasce sempre vinculado a uma
 * fatura, nunca solto.
 */
export function PaymentsListPage() {
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const paymentMethod = searchParams.get('paymentMethod') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const minAmount = searchParams.get('minAmount') ?? '';
  const maxAmount = searchParams.get('maxAmount') ?? '';
  const clientId = searchParams.get('clientId') ?? '';
  const sort = (searchParams.get('sort') ?? 'paymentDate') as NonNullable<
    PaymentListFilters['sort']
  >;
  const order = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc';

  const [searchInput, setSearchInput] = useState(search);
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(dateFrom || dateTo || minAmount || maxAmount),
  );

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

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

  const filters: PaymentListFilters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      sort,
      order,
      ...(search ? { search } : {}),
      ...(paymentMethod
        ? { paymentMethod: paymentMethod as PaymentListFilters['paymentMethod'] }
        : {}),
      ...(clientId ? { clientId } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(minAmount ? { minAmount } : {}),
      ...(maxAmount ? { maxAmount } : {}),
    }),
    [page, search, paymentMethod, clientId, dateFrom, dateTo, minAmount, maxAmount, sort, order],
  );

  const { data, isPending, isFetching, isError, error } = usePayments(filters);

  const hasActiveFilters = Boolean(
    search || paymentMethod || clientId || dateFrom || dateTo || minAmount || maxAmount,
  );

  function toggleSort(column: NonNullable<PaymentListFilters['sort']>): void {
    const nextOrder = sort === column && order === 'asc' ? 'desc' : 'asc';
    updateParams({ sort: column, order: nextOrder, page: '1' });
  }

  /** Atalhos de período — as três perguntas mais frequentes do fechamento. */
  function applyQuickRange(kind: 'today' | 'month' | 'clear'): void {
    if (kind === 'clear') {
      updateParams({ dateFrom: '', dateTo: '', page: '1' });
      return;
    }

    const now = new Date();
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (kind === 'today') {
      updateParams({ dateFrom: todayLocal, dateTo: todayLocal, page: '1' });
      return;
    }

    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    updateParams({ dateFrom: iso(first), dateTo: todayLocal, page: '1' });
    setShowAdvanced(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Pagamentos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? `${data.total} ${data.total === 1 ? 'pagamento registrado' : 'pagamentos registrados'}`
              : 'Carregando…'}
          </p>
        </div>

        {/* O total do FILTRO, não da página — é a resposta que a tela existe
            para dar, e somar só a página mentiria a partir do 21º lançamento. */}
        {data && data.total > 0 && (
          <Card className="min-w-[200px]">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Total {hasActiveFilters ? 'do filtro' : 'recebido'}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700">
                {formatCurrency(data.totalAmount)}
              </p>
            </CardContent>
          </Card>
        )}
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
                placeholder="Buscar por fatura, cliente ou observação…"
                className="pl-9"
                aria-label="Buscar pagamentos"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={paymentMethod || ALL}
                onValueChange={(value) => updateParams({ paymentMethod: value, page: '1' })}
              >
                <SelectTrigger className="w-[170px]" aria-label="Filtrar por forma">
                  <SlidersHorizontal className="size-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as formas</SelectItem>
                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={() => applyQuickRange('today')}>
                Hoje
              </Button>
              <Button variant="outline" size="sm" onClick={() => applyQuickRange('month')}>
                Este mês
              </Button>

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

          {showAdvanced && (
            <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Data do pagamento</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(event) =>
                      updateParams({ dateFrom: event.target.value, page: '1' })
                    }
                    aria-label="Pagamento — de"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => updateParams({ dateTo: event.target.value, page: '1' })}
                    aria-label="Pagamento — até"
                  />
                </div>
              </div>

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
            title="Não foi possível carregar os pagamentos"
            description={error instanceof Error ? error.message : undefined}
            icon={CircleDollarSign}
          />
        ) : isPending ? (
          <TableSkeleton />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={
              hasActiveFilters ? 'Nenhum pagamento encontrado' : 'Nenhum pagamento registrado'
            }
            description={
              hasActiveFilters
                ? 'Tente outro termo de busca ou limpe os filtros aplicados.'
                : 'Os pagamentos aparecem aqui conforme forem registrados nas faturas.'
            }
            icon={CircleDollarSign}
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
                  <Link to="/faturas?status=OVERDUE">Ver faturas em aberto</Link>
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
                      label="Data"
                      column="paymentDate"
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
                  <TableHead className="hidden md:table-cell">Forma</TableHead>
                  <TableHead className="hidden lg:table-cell">Usuário</TableHead>
                  <TableHead className="hidden xl:table-cell">Situação da fatura</TableHead>
                  <TableHead className="w-[60px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data?.items.map((payment) => (
                  <TableRow
                    key={payment.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/faturas/${payment.invoice.id}`)}
                  >
                    <TableCell className="whitespace-nowrap font-medium">
                      {formatDate(payment.paymentDate)}
                    </TableCell>

                    <TableCell>
                      <p className="max-w-[180px] truncate text-foreground">
                        {payment.client.name}
                      </p>
                      <p className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {formatCpfCnpj(payment.client.cpfCnpj)}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {payment.invoice.number}
                      {payment.contract && (
                        <p className="text-xs text-muted-foreground">
                          {payment.contract.number}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap font-medium tabular-nums text-emerald-700">
                      {formatCurrency(payment.amount)}
                      {/* Pagamento menor que a fatura é parcial — dizer isso
                          evita que alguém leia a linha como quitação. */}
                      {Number(payment.amount) < Number(payment.invoice.amount) && (
                        <p className="text-xs font-normal text-muted-foreground">
                          de {formatCurrency(payment.invoice.amount)}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      <Badge variant="outline">
                        {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                      </Badge>
                    </TableCell>

                    <TableCell className="hidden max-w-[160px] truncate lg:table-cell">
                      {payment.registeredByName}
                    </TableCell>

                    <TableCell className="hidden xl:table-cell">
                      <InvoiceStatusBadge status={payment.invoice.status} />
                    </TableCell>

                    <TableCell className="text-right">
                      <div onClick={(event) => event.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          asChild
                          aria-label="Abrir fatura do pagamento"
                        >
                          <Link to={`/faturas/${payment.invoice.id}`}>
                            <SquareArrowOutUpRight />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

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
  column: NonNullable<PaymentListFilters['sort']>;
  activeColumn: string;
  order: 'asc' | 'desc';
  onClick: (column: NonNullable<PaymentListFilters['sort']>) => void;
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
          <Skeleton className="h-4 w-24" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="hidden h-4 w-20 sm:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
