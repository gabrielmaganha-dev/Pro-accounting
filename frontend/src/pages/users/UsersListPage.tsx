import {
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Clock,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { SortableHead } from '@/components/common/SortableHead';
import { SortSelect, type SortOption } from '@/components/common/SortSelect';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  GoogleAccountBadge,
  TemporaryPasswordBadge,
  UserRoleBadge,
  UserStatusBadge,
} from '@/components/users/UserBadges';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ResetAccessDialog } from '@/components/users/ResetAccessDialog';
import { UserFormDialog } from '@/components/users/UserFormDialog';
import { ConfirmActionDialog } from '@/components/users/ConfirmActionDialog';
import { useAuth } from '@/hooks/use-auth';
import { useDeleteUser, useUpdateUserRole, useUpdateUserStatus, useUsers } from '@/hooks/use-users';
import type { UserRole } from '@/types/auth';
import type { User, UserListFilters, UserStatus } from '@/types/user';
import { formatDate } from '@/utils/format';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

const PAGE_SIZE = 20;

type UserSort = NonNullable<UserListFilters['sort']>;

/** As mesmas colunas ordenáveis do cabeçalho da tabela. */
const SORT_OPTIONS: SortOption<UserSort>[] = [
  { column: 'createdAt', label: 'Criado em' },
  { column: 'name', label: 'Nome' },
  { column: 'email', label: 'E-mail' },
];

/** Ação destrutiva aguardando confirmação. */
type PendingAction =
  | { kind: 'deactivate'; user: User }
  | { kind: 'demote'; user: User }
  | { kind: 'delete'; user: User };

export function UsersListPage() {
  const { user: currentUser } = useAuth();

  // Filtros na URL — ver a nota em ClientsListPage.
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const search = searchParams.get('search') ?? '';
  const role = searchParams.get('role') ?? '';
  const status = searchParams.get('status') ?? '';
  const sort = (searchParams.get('sort') ?? 'createdAt') as NonNullable<UserListFilters['sort']>;
  const order = (searchParams.get('order') ?? 'desc') as 'asc' | 'desc';

  const [searchInput, setSearchInput] = useState(search);

  const [formUser, setFormUser] = useState<User | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const roleMutation = useUpdateUserRole();
  const statusMutation = useUpdateUserStatus();

  // Só a contagem: a lista em si é a da tabela, com o filtro "Aguardando aprovação".
  const pendingQuery = useUsers({ status: 'PENDING', pageSize: 1 });
  const pendingCount = pendingQuery.data?.total ?? 0;
  const deleteMutation = useDeleteUser();

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

  const filters: UserListFilters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      sort,
      order,
      ...(search ? { search } : {}),
      ...(role ? { role: role as UserRole } : {}),
      ...(status ? { status: status as UserStatus } : {}),
    }),
    [page, search, role, status, sort, order],
  );

  const { data, isPending, isFetching, isError, error, refetch } = useUsers(filters);

  const hasActiveFilters = Boolean(search || role || status);

  function toggleSort(column: NonNullable<UserListFilters['sort']>): void {
    const nextOrder = sort === column && order === 'asc' ? 'desc' : 'asc';
    updateParams({ sort: column, order: nextOrder, page: '1' });
  }

  function openCreate(): void {
    setFormUser(undefined);
    setFormOpen(true);
  }

  function openEdit(user: User): void {
    setFormUser(user);
    setFormOpen(true);
  }

  /** Executa a ação destrutiva que estava aguardando confirmação. */
  function runPendingAction(): void {
    if (!pendingAction) return;

    const { kind, user } = pendingAction;
    const close = { onSuccess: () => setPendingAction(null) };

    if (kind === 'deactivate') statusMutation.mutate({ id: user.id, status: 'BLOCKED' }, close);
    if (kind === 'demote') roleMutation.mutate({ id: user.id, role: 'EMPLOYEE' }, close);
    if (kind === 'delete') deleteMutation.mutate(user.id, close);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Usuários
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? `${data.total} ${data.total === 1 ? 'usuário com acesso' : 'usuários com acesso'}`
              : isError
                ? 'Lista indisponível no momento'
                : 'Carregando…'}
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus />
          Novo usuário
        </Button>
      </div>

      {/* Cadastros pelo Google chegam como PENDENTES e não entram até alguém
          aprovar: sem este aviso, o administrador só os encontraria por acaso. */}
      {pendingCount > 0 && status !== 'PENDING' && (
        <Alert>
          <Clock />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {pendingCount === 1
                ? '1 cadastro aguardando a sua aprovação.'
                : `${pendingCount} cadastros aguardando a sua aprovação.`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateParams({ status: 'PENDING', page: '1' })}
            >
              Ver cadastros
            </Button>
          </AlertDescription>
        </Alert>
      )}

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
              placeholder="Buscar por nome ou e-mail…"
              className="pl-9"
              aria-label="Buscar usuários"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={role || ALL}
              onValueChange={(value) => updateParams({ role: value, page: '1' })}
            >
              <SelectTrigger
                className="min-w-[160px] flex-1 sm:w-[190px] sm:flex-none"
                aria-label="Filtrar por perfil"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os perfis</SelectItem>
                <SelectItem value="ADMIN">Administradores</SelectItem>
                <SelectItem value="EMPLOYEE">Funcionários</SelectItem>
              </SelectContent>
            </Select>

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
                <SelectItem value="PENDING">Aguardando aprovação</SelectItem>
                <SelectItem value="BLOCKED">Bloqueados</SelectItem>
              </SelectContent>
            </Select>

            {/* "E-mail" só tem cabeçalho a partir de 1280px, e "Criado em" — a
                ordenação padrão — a partir de 768px. */}
            <SortSelect
              options={SORT_OPTIONS}
              sort={sort}
              order={order}
              onChange={(column, nextOrder) =>
                updateParams({ sort: column, order: nextOrder, page: '1' })
              }
              className="xl:hidden"
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
            title="Não foi possível carregar os usuários"
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
          />
        ) : isPending ? (
          <TableSkeleton />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
            description={
              hasActiveFilters
                ? 'Tente outro termo de busca ou limpe os filtros aplicados.'
                : 'Cadastre o primeiro usuário para dar acesso ao sistema.'
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
                <Button size="sm" onClick={openCreate}>
                  <Plus />
                  Cadastrar usuário
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Colunas por largura de tela — mesma regra das outras listagens.
                O menu de ações fica em todas as larguras: aqui ele não é
                atalho, é o único caminho para editar, resetar e inativar. */}
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Nome"
                    column="name"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                  />
                  <SortableHead
                    label="E-mail"
                    column="email"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                    className="hidden xl:table-cell"
                  />
                  <TableHead className="hidden sm:table-cell">Perfil</TableHead>
                  <TableHead className="hidden sm:table-cell">Situação</TableHead>
                  <SortableHead
                    label="Criado em"
                    column="createdAt"
                    activeColumn={sort}
                    order={order}
                    onClick={toggleSort}
                    className="hidden md:table-cell"
                  />
                  <TableHead className="w-[60px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data?.items.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === currentUser?.id}
                    onEdit={() => openEdit(user)}
                    onReset={() => setResetUser(user)}
                    onPromote={() => roleMutation.mutate({ id: user.id, role: 'ADMIN' })}
                    onDemote={() => setPendingAction({ kind: 'demote', user })}
                    onActivate={() => statusMutation.mutate({ id: user.id, status: 'ACTIVE' })}
                    onDeactivate={() => setPendingAction({ kind: 'deactivate', user })}
                    onDelete={() => setPendingAction({ kind: 'delete', user })}
                  />
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

      <UserFormDialog user={formUser} open={formOpen} onOpenChange={setFormOpen} />

      {resetUser && (
        <ResetAccessDialog
          user={resetUser}
          open
          onOpenChange={(open) => {
            if (!open) setResetUser(null);
          }}
        />
      )}

      {pendingAction && (
        <ConfirmActionDialog
          action={pendingAction}
          isPending={
            statusMutation.isPending || roleMutation.isPending || deleteMutation.isPending
          }
          onConfirm={runPendingAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linha da tabela
// ---------------------------------------------------------------------------

interface UserRowProps {
  user: User;
  /** A própria conta de quem está olhando. */
  isSelf: boolean;
  onEdit: () => void;
  onReset: () => void;
  onPromote: () => void;
  onDemote: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}

function UserRow({
  user,
  isSelf,
  onEdit,
  onReset,
  onPromote,
  onDemote,
  onActivate,
  onDeactivate,
  onDelete,
}: UserRowProps) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{user.name}</p>
          {isSelf && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              você
            </span>
          )}
          {user.mustChangePassword && <TemporaryPasswordBadge />}
          {user.googleLinked && <GoogleAccountBadge />}
        </div>
        {/* Abaixo de 1280px o e-mail não tem coluna própria: vira subtítulo em
            vez de sumir, porque é ele que identifica a conta no login. */}
        <p className="break-all text-xs text-muted-foreground xl:hidden">{user.email}</p>
        {/* No celular perfil e situação também descem para cá. */}
        <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
          <UserRoleBadge role={user.role} />
          <UserStatusBadge status={user.status} />
        </div>
      </TableCell>

      <TableCell className="hidden max-w-[260px] truncate xl:table-cell">{user.email}</TableCell>

      <TableCell className="hidden sm:table-cell">
        <UserRoleBadge role={user.role} />
      </TableCell>

      <TableCell className="hidden sm:table-cell">
        <UserStatusBadge status={user.status} />
      </TableCell>

      <TableCell className="hidden whitespace-nowrap md:table-cell">
        {formatDate(user.createdAt)}
      </TableCell>

      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Ações para ${user.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              Editar dados
            </DropdownMenuItem>

            {/* As ações abaixo somem na própria conta. A API recusa todas elas
                sobre si mesmo — esconder o item evita oferecer um caminho que
                termina em erro. Trocar a própria senha fica no menu do topo. */}
            {!isSelf && (
              <>
                <DropdownMenuItem onSelect={onReset}>
                  <KeyRound />
                  Resetar acesso
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {user.role === 'EMPLOYEE' ? (
                  <DropdownMenuItem onSelect={onPromote}>
                    <ShieldCheck />
                    Tornar administrador
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={onDemote}>
                    <UserCheck />
                    Tornar funcionário
                  </DropdownMenuItem>
                )}

                {user.status === 'PENDING' && (
                  <DropdownMenuItem onSelect={onActivate}>
                    <UserCheck />
                    Aprovar acesso
                  </DropdownMenuItem>
                )}

                {user.status === 'BLOCKED' ? (
                  <DropdownMenuItem onSelect={onActivate}>
                    <UserCheck />
                    Desbloquear
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem destructive onSelect={onDeactivate}>
                    <UserX />
                    {user.status === 'PENDING' ? 'Recusar (bloquear)' : 'Bloquear'}
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem destructive onSelect={onDelete}>
                  <Trash2 />
                  Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
