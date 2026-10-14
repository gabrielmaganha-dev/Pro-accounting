import { Eye, Search, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AuditActionBadge, AuditEntityBadge } from '@/components/audit/AuditActionBadge';
import { AuditDetailDialog } from '@/components/audit/AuditDetailDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { SummaryTile } from '@/components/common/SummaryTile';
import { TableSkeleton } from '@/components/common/TableSkeleton';
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
import { useAuditLogs } from '@/hooks/use-audit';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITIES,
  AUDIT_ENTITY_LABELS,
  type AuditAction,
  type AuditEntity,
  type AuditFilters,
  type AuditLog,
} from '@/types/audit';
import { formatDateTime } from '@/utils/format';

const ALL = '__all__';
const PAGE_SIZE = 20;

/**
 * Trilha de auditoria.
 *
 * Tela de SUPERVISÃO, restrita a administradores — mostra o que todos fizeram,
 * com IP e navegador. Só leitura: não há como editar nem apagar uma linha, aqui
 * ou na API, porque uma trilha que o administrador pode reescrever não prova
 * nada.
 */
export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const action = searchParams.get('action') ?? '';
  const entity = searchParams.get('entity') ?? '';
  const search = searchParams.get('search') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';

  const [searchInput, setSearchInput] = useState(search);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (searchInput === search) return;

    const timer = setTimeout(() => updateParams({ search: searchInput, page: '1' }), 400);
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

  const filters: AuditFilters = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(action ? { action: action as AuditAction } : {}),
      ...(entity ? { entity: entity as AuditEntity } : {}),
      ...(search ? { search } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [page, action, entity, search, from, to],
  );

  const { data, isPending, isFetching, isError, error, refetch } = useAuditLogs(filters);

  const hasFilters = Boolean(action || entity || search || from || to);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Auditoria
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quem fez o quê, quando e de onde. Somente leitura — nenhuma linha pode ser alterada
          ou removida.
        </p>
      </div>

      {/* ---------------- Resumo ---------------- */}
      {!(isError && !data) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile
            label="Eventos registrados"
            value={String(data?.summary.total ?? 0)}
            isLoading={isPending}
          />
          <SummaryTile
            label="Nas últimas 24 horas"
            value={String(data?.summary.last24h ?? 0)}
            isLoading={isPending}
          />
          <SummaryTile
            label="Logins recusados (7 dias)"
            value={String(data?.summary.failedLogins7d ?? 0)}
            // Destaque só quando há o que olhar: um zero em vermelho treina o
            // olho a ignorar o vermelho.
            tone={data && data.summary.failedLogins7d > 0 ? 'text-red-700' : undefined}
            isLoading={isPending}
          />
          <SummaryTile
            label="Usuários ativos (7 dias)"
            value={String(data?.summary.activeUsers7d ?? 0)}
            isLoading={isPending}
          />
        </div>
      )}

      {/* ---------------- Filtros ---------------- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          {/* Datas lado a lado já no celular: empilhados, os cinco filtros
              ocupavam uma tela inteira antes da primeira linha da trilha. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="audit-search">Buscar</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="audit-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Usuário, e-mail, registro ou IP…"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-from">De</Label>
              <Input
                id="audit-from"
                type="date"
                value={from}
                onChange={(event) => updateParams({ from: event.target.value, page: '1' })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="audit-to">Até</Label>
              <Input
                id="audit-to"
                type="date"
                value={to}
                onChange={(event) => updateParams({ to: event.target.value, page: '1' })}
                {...(from ? { min: from } : {})}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[140px] flex-1 space-y-1.5 sm:flex-none">
              <Label htmlFor="audit-action">Ação</Label>
              <Select
                value={action || ALL}
                onValueChange={(value) => updateParams({ action: value, page: '1' })}
              >
                <SelectTrigger id="audit-action" className="w-full sm:w-[230px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as ações</SelectItem>
                  {AUDIT_ACTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {AUDIT_ACTION_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px] flex-1 space-y-1.5 sm:flex-none">
              <Label htmlFor="audit-entity">Onde</Label>
              <Select
                value={entity || ALL}
                onValueChange={(value) => updateParams({ entity: value, page: '1' })}
              >
                <SelectTrigger id="audit-entity" className="w-full sm:w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tudo</SelectItem>
                  {AUDIT_ENTITIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {AUDIT_ENTITY_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
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
            title="Não foi possível carregar a trilha"
            description={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
          />
        ) : isPending ? (
          <TableSkeleton rows={8} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Nenhum evento encontrado' : 'Nenhum evento registrado'}
            description={
              hasFilters
                ? 'Ajuste o período, a ação ou o termo de busca.'
                : 'A trilha é preenchida automaticamente conforme o sistema é usado.'
            }
            icon={ShieldCheck}
          />
        ) : (
          <>
            {/* Colunas por largura de tela — mesma regra das outras listagens.
                Abaixo de 768px a linha vira uma célula só (quem, o quê, em
                qual registro e quando) mais o botão de detalhe. */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden whitespace-nowrap md:table-cell">Quando</TableHead>
                  <TableHead className="max-md:pl-4">Quem</TableHead>
                  <TableHead className="hidden md:table-cell">Ação</TableHead>
                  <TableHead className="hidden wide:table-cell">Onde</TableHead>
                  <TableHead className="hidden xl:table-cell">Registro</TableHead>
                  <TableHead className="hidden wide:table-cell">IP</TableHead>
                  <TableHead className="w-[60px] text-right">Detalhe</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data?.items.map((log) => (
                  <TableRow key={log.id} className="cursor-pointer" onClick={() => setSelected(log)}>
                    <TableCell className="hidden whitespace-nowrap text-xs tabular-nums md:table-cell">
                      {formatDateTime(log.createdAt)}
                    </TableCell>

                    <TableCell className="max-md:pl-4 md:max-w-[190px]">
                      <p className="font-medium text-foreground md:truncate">
                        {log.userName ?? log.userEmail ?? '—'}
                      </p>
                      {log.userName && log.userEmail && (
                        <p className="hidden truncate text-xs text-muted-foreground md:block">
                          {log.userEmail}
                        </p>
                      )}
                      {/* Abaixo de 768px ação, registro e horário não têm
                          coluna própria: descem para cá em vez de sumir. */}
                      <div className="mt-1 space-y-1 md:hidden">
                        <AuditActionBadge action={log.action} />
                        {log.entityLabel && (
                          <p className="break-all text-xs text-muted-foreground">
                            {log.entityLabel}
                          </p>
                        )}
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatDateTime(log.createdAt)}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell className="hidden md:table-cell">
                      <AuditActionBadge action={log.action} />
                      {/* O registro só ganha coluna a partir de 1280px. */}
                      {log.entityLabel && (
                        <p className="mt-1 max-w-[190px] truncate text-xs text-muted-foreground xl:hidden">
                          {log.entityLabel}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="hidden wide:table-cell">
                      <AuditEntityBadge entity={log.entity} />
                    </TableCell>

                    <TableCell className="hidden max-w-[210px] truncate xl:table-cell">
                      {log.entityLabel ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap font-mono text-xs wide:table-cell">
                      {log.ip ?? '—'}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Ver detalhe do evento"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelected(log);
                        }}
                      >
                        <Eye />
                      </Button>
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

      {selected && <AuditDetailDialog log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
