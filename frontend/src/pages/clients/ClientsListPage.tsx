import {
  ArrowDownAZ,
  ArrowUpAZ,
  Eye,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useClients } from '@/hooks/use-clients';
import { BRAZILIAN_STATES, type ClientListFilters, type ClientStatus } from '@/types/client';
import { formatCpfCnpj, formatDate, formatPhone } from '@/utils/format';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

const PAGE_SIZE = 20;

export function ClientsListPage() {
  const navigate = useNavigate();

  /**
   * Os filtros vivem na URL, não em estado local.
   *
   * Assim o botão Voltar do navegador funciona, a busca pode ser enviada por
   * link a um colega, e voltar da tela de detalhes não perde o filtro que a
   * pessoa tinha aplicado — que é o incômodo mais comum em listagem
   * administrativa.
   */
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const state = searchParams.get('state') ?? '';
  const sort = (searchParams.get('sort') ?? 'createdAt') as NonNullable<ClientListFilters['sort']>;
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

  const filters: ClientListFilters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      sort,
      order,
      ...(search ? { search } : {}),
      ...(status ? { status: status as ClientStatus } : {}),
      ...(state ? { state } : {}),
    }),
    [page, search, status, state, sort, order],
  );

  const { data, isPending, isFetching, isError, error } = useClients(filters);

  const hasActiveFilters = Boolean(search || status || state);

  function toggleSort(column: NonNullable<ClientListFilters['sort']>): void {
    const nextOrder = sort === column && order === 'asc' ? 'desc' : 'asc';
    updateParams({ sort: column, order: nextOrder, page: '1' });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Clientes
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? `${data.total} ${data.total === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}`
              : 'Carregando…'}
          </p>
        </div>

        <Button asChild>
          <Link to="/clientes/novo">
            <Plus />
            Novo cliente
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
              placeholder="Buscar por nome, CPF/CNPJ ou e-mail…"
              className="pl-9"
              aria-label="Buscar clientes"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={status || ALL}
              onValueChange={(value) => updateParams({ status: value, page: '1' })}
            >
              <SelectTrigger className="w-[150px]" aria-label="Filtrar por situação">
                <SlidersHorizontal className="size-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas situações</SelectItem>
                <SelectItem value="ACTIVE">Ativos</SelectItem>
                <SelectItem value="INACTIVE">Inativos</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={state || ALL}
              onValueChange={(value) => updateParams({ state: value, page: '1' })}
            >
              <SelectTrigger className="w-[110px]" aria-label="Filtrar por UF">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas UF</SelectItem>
                {BRAZILIAN_STATES.map((uf) => (
                  <SelectItem key={uf} value={uf}>
                    {uf}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
          <EmptyState
            title="Não foi possível carregar os clientes"
            description={error instanceof Error ? error.message : undefined}
            icon={Users}
          />
        ) : isPending ? (
          <TableSkeleton />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            description={
              hasActiveFilters
                ? 'Tente outro termo de busca ou limpe os filtros aplicados.'
                : 'Cadastre o primeiro cliente para começar a criar contratos e faturas.'
            }
            icon={UserPlus}
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
                  <Link to="/clientes/novo">
                    <Plus />
                    Cadastrar cliente
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
                      label="Cliente"
                      column="name"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">Nome fantasia</TableHead>
                  <TableHead>CPF / CNPJ</TableHead>
                  <TableHead className="hidden lg:table-cell">E-mail</TableHead>
                  <TableHead className="hidden md:table-cell">Telefone</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="hidden xl:table-cell">
                    <SortButton
                      label="Cadastro"
                      column="createdAt"
                      activeColumn={sort}
                      order={order}
                      onClick={toggleSort}
                    />
                  </TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data?.items.map((client) => (
                  <TableRow
                    key={client.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/clientes/${client.id}`)}
                  >
                    <TableCell>
                      <p className="font-medium text-foreground">{client.name}</p>
                      {/* Abaixo de 1280px o nome fantasia não tem coluna
                          própria, então aparece aqui como subtítulo em vez
                          de simplesmente sumir. */}
                      {client.companyName && (
                        <p className="text-xs text-muted-foreground xl:hidden">
                          {client.companyName}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="hidden xl:table-cell">
                      {client.companyName ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatCpfCnpj(client.cpfCnpj)}
                    </TableCell>

                    <TableCell className="hidden max-w-[220px] truncate lg:table-cell">
                      {client.email ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      {formatPhone(client.phone)}
                    </TableCell>

                    <TableCell>
                      <ClientStatusBadge status={client.status} />
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap xl:table-cell">
                      {formatDate(client.createdAt)}
                    </TableCell>

                    <TableCell className="text-right">
                      {/* stopPropagation: sem ele, clicar em Editar abriria a
                          tela de detalhes (clique da linha) e logo em seguida
                          a de edição. */}
                      <div
                        className="flex justify-end gap-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Button variant="ghost" size="icon" asChild aria-label="Ver detalhes">
                          <Link to={`/clientes/${client.id}`}>
                            <Eye />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild aria-label="Editar cliente">
                          <Link to={`/clientes/${client.id}/editar`}>
                            <Pencil />
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

interface SortButtonProps {
  label: string;
  column: NonNullable<ClientListFilters['sort']>;
  activeColumn: string;
  order: 'asc' | 'desc';
  onClick: (column: NonNullable<ClientListFilters['sort']>) => void;
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
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="hidden h-4 w-32 sm:block" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
