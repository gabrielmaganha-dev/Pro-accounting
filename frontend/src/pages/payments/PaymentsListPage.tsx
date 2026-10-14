import {
  CircleDollarSign,
  Search,
  SlidersHorizontal,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AmountRangeField } from '@/components/common/AmountRangeField';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { SortableHead } from '@/components/common/SortableHead';
import { SortSelect, type SortOption } from '@/components/common/SortSelect';
import { SummaryTile } from '@/components/common/SummaryTile';
import { TableSkeleton } from '@/components/common/TableSkeleton';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePayments } from '@/hooks/use-payments';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/types/dashboard';
import { PAYMENT_METHOD_OPTIONS } from '@/types/invoice';
import type { PaymentListFilters } from '@/types/payment';
import { formatCpfCnpj, formatCurrency, formatDate } from '@/utils/format';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

const PAGE_SIZE = 20;

type PaymentSort = NonNullable<PaymentListFilters['sort']>;

/** As mesmas colunas ordenáveis do cabeçalho da tabela. */
const SORT_OPTIONS: SortOption<PaymentSort>[] = [
  { column: 'paymentDate', label: 'Data' },
  { column: 'client', label: 'Cliente' },
  { column: 'amount', label: 'Valor' },
];

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

  const { data, isPending, isFetching, isError, error, refetch } = usePayments(filters);

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
              : isError
                ? 'Lista indisponível no momento'
                : 'Carregando…'}
          </p>
        </div>

        {/* O total do FILTRO, não da página — é a resposta que a tela existe
            para dar, e somar só a página mentiria a partir do 21º lançamento. */}
        {data && data.total > 0 && (
          <div className="w-full min-w-[200px] sm:w-auto">
            <SummaryTile
              label={`Total ${hasActiveFilters ? 'do filtro' : 'recebido'}`}
              value={formatCurrency(data.totalAmount)}
              tone="text-emerald-700"
            />
          </div>
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
                <SelectTrigger
                  className="min-w-[160px] flex-1 sm:w-[190px] sm:flex-none"
                  aria-label="Filtrar por forma de pagamento"
                >
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

              {/* A coluna "Cliente" só existe a partir de 768px. */}
              <SortSelect
                options={SORT_OPTIONS}
                sort={sort}
                order={order}
                onChange={(column, nextOrder) =>
                  updateParams({ sort: column, order: nextOrder, page: '1' })
                }
                className="md:hidden"
              />

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
                aria-expanded={showAdvanced}
                aria-controls="pagamentos-filtros-avancados"
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
            <div
              id="pagamentos-filtros-avancados"
              className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2"
            >
              <div className="space-y-1.5">
                <Label className="text-xs">Data do pagamento</Label>
                {/* Dois campos de data lado a lado não cabem em 300px:
                    empilham abaixo de 480px. */}
                <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:items-center">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(event) =>
                      updateParams({ dateFrom: event.target.value, page: '1' })
                    }
                    aria-label="Pagamento — de"
                  />
                  <span className="hidden text-xs text-muted-foreground min-[480px]:inline">
                    até
                  </span>
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
        {/* `&& !data`: um refetch em segundo plano que falha (rede oscilou,
            limite de requisições) deixa a consulta em erro COM os dados
            anteriores em cache. Trocar a lista inteira por uma tela de erro
            nesse caso esconderia conteúdo válido. */}
        {isError && !data ? (
          <ErrorState
            title="Não foi possível carregar os pagamentos"
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
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
            {/* Colunas por largura de tela — mesma regra das outras listagens.
                Abaixo de 768px a linha vira duas células: data, cliente e
                fatura à esquerda; valor e forma à direita. */}
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Data"
                    column="paymentDate"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                  />
                  <SortableHead
                    label="Cliente"
                    column="client"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                    className="hidden md:table-cell"
                  />
                  <TableHead className="hidden md:table-cell">Fatura</TableHead>
                  <SortableHead
                    label="Valor"
                    column="amount"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                    className="text-right max-md:pr-4 md:text-left"
                  />
                  <TableHead className="hidden xl:table-cell">Forma</TableHead>
                  <TableHead className="hidden wide:table-cell">Usuário</TableHead>
                  <TableHead className="hidden 2xl:table-cell">Situação da fatura</TableHead>
                  <TableHead className="hidden w-[60px] text-right xl:table-cell">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data?.items.map((payment) => (
                  <TableRow
                    key={payment.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/faturas/${payment.invoice.id}`)}
                  >
                    <TableCell>
                      <p className="whitespace-nowrap font-medium">
                        {formatDate(payment.paymentDate)}
                      </p>
                      {/* Quem lançou só ganha coluna a partir de 1440px — e é
                          para conferir isso que a tela existe. */}
                      <p className="hidden max-w-[150px] truncate text-xs text-muted-foreground md:block wide:hidden">
                        por {payment.registeredByName}
                      </p>
                      {/* Abaixo de 768px cliente e fatura não têm coluna
                          própria: aparecem aqui em vez de sumir. */}
                      <p className="text-sm text-foreground md:hidden">{payment.client.name}</p>
                      <Link
                        to={`/faturas/${payment.invoice.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-xs text-muted-foreground underline-offset-2 hover:underline md:hidden"
                      >
                        {payment.invoice.number}
                      </Link>
                    </TableCell>

                    <TableCell className="hidden md:table-cell">
                      <p className="max-w-[180px] truncate text-foreground">
                        {payment.client.name}
                      </p>
                      <p className="max-w-[180px] truncate text-xs text-muted-foreground">
                        {formatCpfCnpj(payment.client.cpfCnpj)}
                      </p>
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      {/* Link de verdade: torna a fatura alcançável por teclado
                          e leitor de tela. stopPropagation evita navegar duas
                          vezes (link + clique da linha). */}
                      <Link
                        to={`/faturas/${payment.invoice.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-foreground underline-offset-2 hover:underline"
                      >
                        {payment.invoice.number}
                      </Link>
                      {payment.contract && (
                        <p className="text-xs text-muted-foreground">
                          {payment.contract.number}
                        </p>
                      )}
                      {/* A situação da fatura só ganha coluna a partir de 1536px. */}
                      <p className="text-xs text-muted-foreground 2xl:hidden">
                        {INVOICE_STATUS_LABELS[payment.invoice.status]}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-emerald-700 max-md:pr-4 md:text-left">
                      {formatCurrency(payment.amount)}
                      {/* Pagamento menor que a fatura é parcial — dizer isso
                          evita que alguém leia a linha como quitação. */}
                      {Number(payment.amount) < Number(payment.invoice.amount) && (
                        <p className="text-xs font-normal text-muted-foreground">
                          de {formatCurrency(payment.invoice.amount)}
                        </p>
                      )}
                      {/* A forma só ganha coluna a partir de 1280px. */}
                      <p className="text-xs font-normal text-muted-foreground xl:hidden">
                        {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                      </p>
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap xl:table-cell">
                      <Badge variant="outline">
                        {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                      </Badge>
                    </TableCell>

                    <TableCell className="hidden max-w-[160px] truncate wide:table-cell">
                      {payment.registeredByName}
                    </TableCell>

                    <TableCell className="hidden 2xl:table-cell">
                      <InvoiceStatusBadge status={payment.invoice.status} />
                    </TableCell>

                    <TableCell className="hidden text-right xl:table-cell">
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
