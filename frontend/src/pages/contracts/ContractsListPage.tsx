import {
  CalendarClock,
  Eye,
  FilePlus2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ListSkeleton } from '@/components/common/ListSkeleton';
import { MobileList, MobileListItem } from '@/components/common/MobileList';
import { Pagination } from '@/components/common/Pagination';
import { SortableHead } from '@/components/common/SortableHead';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { useContracts } from '@/hooks/use-contracts';
import { tableFrom } from '@/lib/list-layout';
import { CONTRACT_STATUS_OPTIONS, type ContractListFilters } from '@/types/contract';
import { CONTRACT_STATUS_LABELS } from '@/types/dashboard';
import { formatCurrency, formatDate } from '@/utils/format';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

const PAGE_SIZE = 20;

/** Janela do filtro "vencendo em breve". Igual à usada nos alertas do painel. */
const EXPIRING_WINDOW_DAYS = 30;

export function ContractsListPage() {
  const navigate = useNavigate();

  /**
   * Os filtros vivem na URL, não em estado local.
   *
   * Assim o botão Voltar do navegador funciona, a busca pode ser enviada por
   * link a um colega, e voltar da ficha não perde o filtro aplicado. É também
   * o que permite o painel apontar para "/contratos?expiringInDays=30" e a
   * tela abrir já filtrada.
   */
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const expiring = searchParams.get('expiringInDays') ?? '';
  const sort = (searchParams.get('sort') ?? 'createdAt') as NonNullable<
    ContractListFilters['sort']
  >;
  const order = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc';

  // Campo de busca com estado próprio + atraso: sem isso, cada tecla digitada
  // dispararia uma consulta ao banco.
  const [searchInput, setSearchInput] = useState(search);

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

  const filters: ContractListFilters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      sort,
      order,
      ...(search ? { search } : {}),
      ...(status ? { status: status as ContractListFilters['status'] } : {}),
      ...(expiring ? { expiringInDays: Number(expiring) } : {}),
    }),
    [page, search, status, expiring, sort, order],
  );

  const { data, isPending, isFetching, isError, error, refetch } = useContracts(filters);

  const hasActiveFilters = Boolean(search || status || expiring);

  function toggleSort(column: NonNullable<ContractListFilters['sort']>): void {
    const nextOrder = sort === column && order === 'asc' ? 'desc' : 'asc';
    updateParams({ sort: column, order: nextOrder, page: '1' });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Contratos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? `${data.total} ${data.total === 1 ? 'contrato cadastrado' : 'contratos cadastrados'}`
              : 'Carregando…'}
          </p>
        </div>

        <Button asChild>
          <Link to="/contratos/novo">
            <Plus />
            Novo contrato
          </Link>
        </Button>
      </div>

      {/* ---------------- Filtros ---------------- */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por número, serviço ou cliente…"
              className="pl-9"
              aria-label="Buscar contratos"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={status || ALL}
              onValueChange={(value) => updateParams({ status: value, page: '1' })}
            >
              <SelectTrigger className="w-full sm:w-[210px]" aria-label="Filtrar por situação">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as situações</SelectItem>
                {CONTRACT_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {CONTRACT_STATUS_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Atalho para a pergunta mais frequente sobre contratos: quais
                estão prestes a vencer e precisam de renovação. */}
            <Button
              variant={expiring ? 'default' : 'outline'}
              size="sm"
              aria-pressed={Boolean(expiring)}
              onClick={() =>
                updateParams({
                  expiringInDays: expiring ? '' : String(EXPIRING_WINDOW_DAYS),
                  page: '1',
                })
              }
            >
              <CalendarClock />
              Vencendo em {EXPIRING_WINDOW_DAYS} dias
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
        </CardContent>
      </Card>

      {/* ---------------- Tabela ---------------- */}
      <Card className="overflow-hidden">
        {isError ? (
          <ErrorState
            title="Não foi possível carregar os contratos"
            error={error}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
          />
        ) : isPending ? (
          <ListSkeleton />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'Nenhum contrato encontrado' : 'Nenhum contrato cadastrado'}
            description={
              hasActiveFilters
                ? 'Tente outro termo de busca ou limpe os filtros aplicados.'
                : 'Cadastre o primeiro contrato para começar a emitir faturas.'
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
                  <Link to="/contratos/novo">
                    <Plus />
                    Cadastrar contrato
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <MobileList label="Contratos" until="lg">
              {data?.items.map((contract) => (
                <MobileListItem
                  key={contract.id}
                  to={`/contratos/${contract.id}`}
                  title={contract.number}
                  subtitle={`${contract.client.name} · ${contract.serviceType}`}
                  aside={
                    <>
                      {formatCurrency(contract.monthlyValue)}
                      <span className="text-xs font-normal text-muted-foreground"> /mês</span>
                    </>
                  }
                  footer={
                    <>
                      <ContractStatusBadge status={contract.status} />
                      <span>
                        {contract.endDate
                          ? `Término ${formatDate(contract.endDate)}`
                          : 'Prazo indeterminado'}
                      </span>
                    </>
                  }
                />
              ))}
            </MobileList>

            {/* Colunas extras um degrau depois do que a janela sugere: a partir
                de lg o menu lateral ocupa 256px da largura. */}
            <div className={tableFrom('lg')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      label="Número"
                      column="number"
                      activeColumn={sort}
                      order={order}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label="Cliente"
                      column="client"
                      activeColumn={sort}
                      order={order}
                      onSort={toggleSort}
                    />
                    <TableHead className="hidden 2xl:table-cell">Serviço</TableHead>
                    <SortableHead
                      label="Valor mensal"
                      column="monthlyValue"
                      activeColumn={sort}
                      order={order}
                      onSort={toggleSort}
                    />
                    <SortableHead
                      label="Início"
                      column="startDate"
                      activeColumn={sort}
                      order={order}
                      onSort={toggleSort}
                      className="hidden 2xl:table-cell"
                    />
                    <SortableHead
                      label="Término"
                      column="endDate"
                      activeColumn={sort}
                      order={order}
                      onSort={toggleSort}
                      className="hidden xl:table-cell"
                    />
                    <TableHead className="hidden 2xl:table-cell">Vencimento</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {data?.items.map((contract) => (
                    <TableRow
                      key={contract.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/contratos/${contract.id}`)}
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        {contract.number}
                      </TableCell>

                      <TableCell>
                        <p className="max-w-[200px] truncate text-foreground">
                          {contract.client.name}
                        </p>
                        {/* Sem coluna própria de serviço (abaixo de 2xl), ele
                          aparece aqui como subtítulo em vez de sumir. */}
                        <p className="max-w-[200px] truncate text-xs text-muted-foreground 2xl:hidden">
                          {contract.serviceType}
                        </p>
                      </TableCell>

                      <TableCell className="hidden max-w-[200px] truncate 2xl:table-cell">
                        {contract.serviceType}
                      </TableCell>

                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatCurrency(contract.monthlyValue)}
                        <span className="text-xs text-muted-foreground"> /mês</span>
                      </TableCell>

                      <TableCell className="hidden whitespace-nowrap 2xl:table-cell">
                        {formatDate(contract.startDate)}
                      </TableCell>

                      <TableCell className="hidden whitespace-nowrap xl:table-cell">
                        {contract.endDate ? (
                          formatDate(contract.endDate)
                        ) : (
                          <span className="text-muted-foreground">Indeterminado</span>
                        )}
                      </TableCell>

                      <TableCell className="hidden whitespace-nowrap tabular-nums 2xl:table-cell">
                        Dia {contract.dueDay}
                      </TableCell>

                      <TableCell>
                        <ContractStatusBadge status={contract.status} />
                      </TableCell>

                      <TableCell className="text-right">
                        {/* stopPropagation: sem ele, clicar em Editar abriria a
                          ficha (clique da linha) e logo em seguida a edição. */}
                        <div
                          className="flex justify-end gap-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Button variant="ghost" size="icon" asChild aria-label="Ver detalhes">
                            <Link to={`/contratos/${contract.id}`}>
                              <Eye />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="icon" asChild aria-label="Editar contrato">
                            <Link to={`/contratos/${contract.id}/editar`}>
                              <Pencil />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
