import { Eye, FilePlus2, Pencil, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AmountRangeField } from '@/components/common/AmountRangeField';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { SortableHead } from '@/components/common/SortableHead';
import { SortSelect, type SortOption } from '@/components/common/SortSelect';
import { TableSkeleton } from '@/components/common/TableSkeleton';
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
import { useInvoices } from '@/hooks/use-invoices';
import { INVOICE_STATUS_LABELS } from '@/types/dashboard';
import { INVOICE_STATUS_OPTIONS, type InvoiceListFilters } from '@/types/invoice';
import { formatCurrency, formatDate } from '@/utils/format';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

const PAGE_SIZE = 20;

type InvoiceSort = NonNullable<InvoiceListFilters['sort']>;

/** As mesmas colunas ordenáveis do cabeçalho da tabela. */
const SORT_OPTIONS: SortOption<InvoiceSort>[] = [
  { column: 'dueDate', label: 'Vencimento' },
  { column: 'issueDate', label: 'Emissão' },
  { column: 'number', label: 'Número' },
  { column: 'client', label: 'Cliente' },
  { column: 'amount', label: 'Valor' },
];

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

  const { data, isPending, isFetching, isError, error, refetch } = useInvoices(filters);

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
              : isError
                ? 'Lista indisponível no momento'
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
                <SelectTrigger
                  className="min-w-[160px] flex-1 sm:w-[190px] sm:flex-none"
                  aria-label="Filtrar por situação"
                >
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

              {/* "Vencimento" — a ordenação padrão — só tem cabeçalho a partir
                  de 1280px, e "Emissão" a partir de 1536px. Abaixo disso é
                  por aqui que se ordena. */}
              <SortSelect
                options={SORT_OPTIONS}
                sort={sort}
                order={order}
                onChange={(column, nextOrder) =>
                  updateParams({ sort: column, order: nextOrder, page: '1' })
                }
                className="2xl:hidden"
              />

              <Button
                variant={showAdvanced ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                aria-expanded={showAdvanced}
                aria-controls="faturas-filtros-avancados"
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
            <div
              id="faturas-filtros-avancados"
              className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-3"
            >
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
        {/* `&& !data`: um refetch em segundo plano que falha (rede oscilou,
            limite de requisições) deixa a consulta em erro COM os dados
            anteriores em cache. Trocar a lista inteira por uma tela de erro
            nesse caso esconderia conteúdo válido. */}
        {isError && !data ? (
          <ErrorState
            title="Não foi possível carregar as faturas"
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
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
            {/* Colunas por largura de tela — mesma regra das outras listagens.

                Eram dez colunas, e nem num monitor de 1440px cabiam: situação
                e ações ficavam fora da tela. Contrato e descrição viraram
                subtítulo permanente de número e cliente; emissão e pagamento
                só entram quando há largura para eles.

                Abaixo de 768px a linha vira duas células: identificação à
                esquerda e valor + vencimento + situação à direita. */}
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Número"
                    column="number"
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
                  <SortableHead
                    label="Valor"
                    column="amount"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                    className="text-right max-md:pr-4 md:text-left"
                  />
                  <SortableHead
                    label="Emissão"
                    column="issueDate"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                    className="hidden 2xl:table-cell"
                  />
                  <SortableHead
                    label="Vencimento"
                    column="dueDate"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                    className="hidden xl:table-cell"
                  />
                  <TableHead className="hidden wide:table-cell">Pagamento</TableHead>
                  <TableHead className="hidden md:table-cell">Situação</TableHead>
                  <TableHead className="hidden w-[100px] text-right xl:table-cell">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data?.items.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/faturas/${invoice.id}`)}
                  >
                    <TableCell>
                      {/* Link de verdade: torna a ficha alcançável por teclado
                          e leitor de tela. stopPropagation evita navegar duas
                          vezes (link + clique da linha). */}
                      <Link
                        to={`/faturas/${invoice.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="whitespace-nowrap font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {invoice.number}
                      </Link>
                      <p className="hidden whitespace-nowrap text-xs text-muted-foreground md:block">
                        {invoice.contract ? invoice.contract.number : 'Avulsa'}
                      </p>
                      {/* Abaixo de 768px o cliente não tem coluna própria:
                          aparece aqui em vez de sumir. */}
                      <p className="text-sm text-foreground md:hidden">{invoice.client.name}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground md:hidden">
                        {invoice.description ?? 'Sem descrição'}
                      </p>
                    </TableCell>

                    <TableCell className="hidden md:table-cell">
                      <p className="max-w-[200px] truncate text-foreground">
                        {invoice.client.name}
                      </p>
                      <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {invoice.description ?? 'Sem descrição'}
                      </p>
                    </TableCell>

                    <TableCell className="whitespace-nowrap text-right tabular-nums max-md:pr-4 md:text-left">
                      {formatCurrency(invoice.amount)}
                      {/* Pagamento parcial precisa aparecer aqui: sem isso, uma
                          fatura de R$ 1.200 com R$ 800 pagos parece intocada. */}
                      {Number(invoice.paidAmount) > 0 &&
                        Number(invoice.outstanding) > 0 && (
                          <p className="text-xs text-amber-700">
                            resta {formatCurrency(invoice.outstanding)}
                          </p>
                        )}
                      {/* O vencimento só ganha coluna a partir de 1280px. */}
                      <p className="text-xs text-muted-foreground xl:hidden">
                        vence {formatDate(invoice.dueDate)}
                      </p>
                      <div className="mt-1 md:hidden">
                        <InvoiceStatusBadge
                          status={invoice.status}
                          daysOverdue={invoice.daysOverdue}
                        />
                      </div>
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap 2xl:table-cell">
                      {formatDate(invoice.issueDate)}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap xl:table-cell">
                      {formatDate(invoice.dueDate)}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap wide:table-cell">
                      {invoice.lastPaymentDate ? (
                        formatDate(invoice.lastPaymentDate)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="hidden md:table-cell">
                      <InvoiceStatusBadge
                        status={invoice.status}
                        daysOverdue={invoice.daysOverdue}
                      />
                      {/* Sem a coluna de pagamento (abaixo de 1440px), a data
                          em que o dinheiro entrou vem junto da situação. */}
                      {invoice.lastPaymentDate && (
                        <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground wide:hidden">
                          pago em {formatDate(invoice.lastPaymentDate)}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="hidden text-right xl:table-cell">
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
      <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:items-center">
        <Input
          type="date"
          value={from}
          onChange={(event) => onChange(event.target.value, to)}
          aria-label={`${label} — de`}
        />
        <span className="hidden text-xs text-muted-foreground min-[480px]:inline">até</span>
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
