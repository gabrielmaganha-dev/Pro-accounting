import { Eye, Pencil, Plus, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { SortableHead } from '@/components/common/SortableHead';
import { SortSelect, type SortOption } from '@/components/common/SortSelect';
import { TableSkeleton } from '@/components/common/TableSkeleton';
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
import { useClients } from '@/hooks/use-clients';
import { BRAZILIAN_STATES, type ClientListFilters, type ClientStatus } from '@/types/client';
import { formatCpfCnpj, formatDate, formatPhone } from '@/utils/format';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

type ClientSort = NonNullable<ClientListFilters['sort']>;

/** As mesmas colunas ordenáveis do cabeçalho da tabela. */
const SORT_OPTIONS: SortOption<ClientSort>[] = [
  { column: 'createdAt', label: 'Cadastro' },
  { column: 'name', label: 'Cliente' },
];

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

  const { data, isPending, isFetching, isError, error, refetch } = useClients(filters);

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
              : isError
                ? 'Lista indisponível no momento'
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
              <SelectTrigger
                className="min-w-[160px] flex-1 sm:w-[190px] sm:flex-none"
                aria-label="Filtrar por situação"
              >
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
              <SelectTrigger
                className="min-w-[120px] flex-1 sm:w-[130px] sm:flex-none"
                aria-label="Filtrar por UF"
              >
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

            {/* "Cadastro" — a ordenação padrão — só tem cabeçalho a partir de
                1440px. Abaixo disso é por aqui que se ordena. */}
            <SortSelect
              options={SORT_OPTIONS}
              sort={sort}
              order={order}
              onChange={(column, nextOrder) =>
                updateParams({ sort: column, order: nextOrder, page: '1' })
              }
              className="wide:hidden"
            />

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
        {/* `&& !data`: um refetch em segundo plano que falha (rede oscilou,
            limite de requisições) deixa a consulta em erro COM os dados
            anteriores em cache. Trocar a lista inteira por uma tela de erro
            nesse caso esconderia conteúdo válido. */}
        {isError && !data ? (
          <ErrorState
            title="Não foi possível carregar os clientes"
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
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
            {/* Colunas por largura de tela. A regra é a mesma em todas as
                listagens: no celular ficam a identificação e a situação, e o
                que não cabe vira subtítulo da primeira coluna em vez de ir
                parar fora da tela. */}
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Cliente"
                    column="name"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                  />
                  <TableHead className="hidden sm:table-cell">CPF / CNPJ</TableHead>
                  <TableHead className="hidden xl:table-cell">E-mail</TableHead>
                  <TableHead className="hidden md:table-cell">Telefone</TableHead>
                  <TableHead>Situação</TableHead>
                  <SortableHead
                    label="Cadastro"
                    column="createdAt"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                    className="hidden wide:table-cell"
                  />
                  <TableHead className="hidden w-[100px] text-right xl:table-cell">Ações</TableHead>
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
                      {/* Link de verdade, não só linha clicável: é o que torna
                          a ficha alcançável por teclado e leitor de tela — e,
                          no celular, onde a coluna de ações não aparece, é o
                          caminho até ela. stopPropagation evita navegar duas
                          vezes (link + clique da linha). */}
                      <Link
                        to={`/clientes/${client.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {client.name}
                      </Link>
                      {client.companyName && (
                        <p className="text-xs text-muted-foreground">{client.companyName}</p>
                      )}
                      <p className="text-xs tabular-nums text-muted-foreground sm:hidden">
                        {formatCpfCnpj(client.cpfCnpj)}
                      </p>
                      {/* O e-mail só ganha coluna a partir de 1280px. */}
                      {client.email && (
                        <p className="hidden break-all text-xs text-muted-foreground md:block xl:hidden">
                          {client.email}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                      {formatCpfCnpj(client.cpfCnpj)}
                    </TableCell>

                    <TableCell className="hidden max-w-[200px] truncate xl:table-cell">
                      {client.email ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      {formatPhone(client.phone)}
                    </TableCell>

                    <TableCell>
                      <ClientStatusBadge status={client.status} />
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap wide:table-cell">
                      {formatDate(client.createdAt)}
                    </TableCell>

                    <TableCell className="hidden text-right xl:table-cell">
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
