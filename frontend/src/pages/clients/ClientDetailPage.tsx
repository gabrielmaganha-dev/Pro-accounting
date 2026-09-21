import {
  ArrowLeft,
  Building2,
  FileText,
  History,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import {
  useClient,
  useClientHistory,
  useClientInvoices,
  useDeleteClient,
  useUpdateClientStatus,
} from '@/hooks/use-clients';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CLIENT_HISTORY_ACTION_LABELS,
  type ClientHistoryEntry,
} from '@/types/client';
import { INVOICE_STATUS_LABELS, type EffectiveInvoiceStatus } from '@/types/dashboard';
import {
  formatCpfCnpj,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPhone,
  formatZipCode,
} from '@/utils/format';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: client, isPending, isError } = useClient(id);
  const statusMutation = useUpdateClientStatus();
  const deleteMutation = useDeleteClient();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  if (isPending) return <DetailSkeleton />;

  if (isError || !client) {
    return (
      <Card>
        <EmptyState
          title="Cliente não encontrado"
          description="O cliente pode ter sido excluído ou o endereço está incorreto."
          icon={UserX}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/clientes">Voltar para a lista</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const isActive = client.status === 'ACTIVE';

  return (
    <div className="space-y-5">
      {/* ---------------- Cabeçalho ---------------- */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Voltar">
          <Link to="/clientes">
            <ArrowLeft />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {client.name}
            </h2>
            <ClientStatusBadge status={client.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.companyName ? `${client.companyName} · ` : ''}
            {formatCpfCnpj(client.cpfCnpj)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={`/clientes/${client.id}/editar`}>
              <Pencil />
              Editar
            </Link>
          </Button>

          {/* Inativar e excluir são exclusivos do administrador. O botão nem
              aparece para o funcionário — e a API recusaria de qualquer forma. */}
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setConfirmStatus(true)}>
                {isActive ? <UserX /> : <UserCheck />}
                {isActive ? 'Inativar' : 'Reativar'}
              </Button>

              <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="text-destructive" />
                Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ---------------- Resumo financeiro ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Contratos" value={String(client.summary.contracts.total)} hint={`${client.summary.contracts.active} ativo(s)`} />
        <SummaryTile label="Recebido" value={formatCurrency(client.summary.amounts.received)} tone="text-emerald-700" />
        <SummaryTile label="Pendente" value={formatCurrency(client.summary.amounts.pending)} hint={`${client.summary.invoices.pending} fatura(s)`} tone="text-amber-800" />
        <SummaryTile label="Atrasado" value={formatCurrency(client.summary.amounts.overdue)} hint={`${client.summary.invoices.overdue} fatura(s)`} tone="text-red-700" />
      </div>

      {/* ---------------- Abas ---------------- */}
      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">
            <Building2 className="size-4" />
            Dados cadastrais
          </TabsTrigger>
          <TabsTrigger value="contratos">
            <FileText className="size-4" />
            Contratos ({client.summary.contracts.total})
          </TabsTrigger>
          <TabsTrigger value="faturas">
            <ReceiptText className="size-4" />
            Faturas ({client.summary.invoices.total})
          </TabsTrigger>
          <TabsTrigger value="historico">
            <History className="size-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Dados cadastrais</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nome / Razão social" value={client.name} />
              <Field label="Nome fantasia" value={client.companyName} />
              <Field label="CPF / CNPJ" value={formatCpfCnpj(client.cpfCnpj)} />
              <Field label="Inscrição Estadual" value={client.stateRegistration} />
              <Field label="E-mail" value={client.email} icon={Mail} />
              <Field label="Telefone" value={formatPhone(client.phone)} icon={Phone} />
              <Field label="WhatsApp" value={formatPhone(client.whatsapp)} icon={Phone} />
              {/* Logradouro e número formam uma linha só: separá-los em dois
                  campos obrigaria o olho a juntar "Rua das Flores" e "482" de
                  volta, que é como o endereço é lido em qualquer documento. */}
              <Field label="Endereço" value={formatStreetLine(client)} icon={MapPin} />
              <Field label="Complemento" value={client.complement} />
              <Field label="Bairro" value={client.neighborhood} />
              <Field
                label="Cidade / UF"
                value={client.city ? `${client.city}${client.state ? ` / ${client.state}` : ''}` : null}
              />
              <Field label="CEP" value={formatZipCode(client.zipCode)} />
              <Field label="Cadastrado em" value={formatDateTime(client.createdAt)} />
              <Field label="Última atualização" value={formatDateTime(client.updatedAt)} />
              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Observações" value={client.notes} multiline />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contratos">
          <Card className="overflow-hidden">
            {client.contracts.length === 0 ? (
              <EmptyState
                title="Nenhum contrato"
                description="Este cliente ainda não possui contratos cadastrados."
                icon={FileText}
                compact
                action={
                  <Button asChild size="sm">
                    <Link to={`/contratos/novo?clienteId=${client.id}`}>
                      <Plus />
                      Novo contrato
                    </Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Valor mensal</TableHead>
                    <TableHead className="hidden md:table-cell">Vigência</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {client.contracts.map((contract) => (
                    <TableRow
                      key={contract.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/contratos/${contract.id}`)}
                    >
                      <TableCell className="font-medium">{contract.number}</TableCell>
                      <TableCell>{contract.serviceType}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatCurrency(contract.monthlyValue)}
                        <span className="text-xs text-muted-foreground"> /mês</span>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-sm md:table-cell">
                        {formatDate(contract.startDate)} →{' '}
                        {contract.endDate ? formatDate(contract.endDate) : 'indeterminado'}
                      </TableCell>
                      <TableCell>
                        <ContractStatusBadge status={contract.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {client.contracts.length > 0 && (
              <div className="flex justify-end border-t border-border px-4 py-3">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/contratos/novo?clienteId=${client.id}`}>
                    <Plus />
                    Novo contrato
                  </Link>
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="faturas">
          <InvoicesTab clientId={client.id} />
        </TabsContent>

        <TabsContent value="historico">
          <HistoryTab clientId={client.id} />
        </TabsContent>
      </Tabs>

      {/* ---------------- Confirmações ---------------- */}
      <AlertDialog open={confirmStatus} onOpenChange={setConfirmStatus}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isActive ? 'Inativar cliente?' : 'Reativar cliente?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? `"${client.name}" deixará de aparecer nas listagens padrão e nos indicadores de clientes ativos. Contratos, faturas e histórico permanecem intactos, e você pode reativá-lo a qualquer momento.`
                : `"${client.name}" voltará a aparecer nas listagens e nos indicadores de clientes ativos.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                statusMutation.mutate({
                  id: client.id,
                  status: isActive ? 'INACTIVE' : 'ACTIVE',
                })
              }
            >
              {isActive ? 'Inativar' : 'Reativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação <strong>não pode ser desfeita</strong> e apaga também o histórico de
              alterações de "{client.name}".
              {client.summary.contracts.total > 0 || client.summary.invoices.total > 0 ? (
                <>
                  {' '}
                  Este cliente possui {client.summary.contracts.total} contrato(s) e{' '}
                  {client.summary.invoices.total} fatura(s), então{' '}
                  <strong>a exclusão será recusada</strong> — use Inativar para tirá-lo da operação
                  sem perder o histórico financeiro.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: 'destructive' }))}
              onClick={() =>
                deleteMutation.mutate(client.id, {
                  onSuccess: () => navigate('/clientes'),
                })
              }
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Valor usado pelo Select para representar "sem filtro". */
const ALL_STATUS = '__all__';

/**
 * Monta "Rua das Flores, 482" a partir dos campos separados.
 *
 * O endereço é guardado desmembrado por exigência de emissão fiscal, mas é
 * lido como uma linha só. Devolve `null` quando não há logradouro, para o
 * campo cair no "Não informado" em vez de exibir uma vírgula solta.
 */
function formatStreetLine(client: { street: string | null; number: string | null }): string | null {
  if (!client.street) return null;

  return client.number ? `${client.street}, ${client.number}` : client.street;
}

function invoiceBadgeVariant(status: string) {
  if (status === 'PAID') return 'success' as const;
  if (status === 'PENDING') return 'warning' as const;
  if (status === 'OVERDUE') return 'danger' as const;
  return 'neutral' as const;
}

function SummaryTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn('mt-1 truncate text-lg font-semibold tabular-nums', tone ?? 'text-foreground')}>
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  icon: Icon,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  icon?: typeof Mail;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 flex items-start gap-1.5 text-sm text-foreground',
          multiline && 'whitespace-pre-wrap',
        )}
      >
        {Icon && value && value !== '—' && (
          <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        {value && value !== '—' ? value : <span className="text-muted-foreground">Não informado</span>}
      </p>
    </div>
  );
}

/**
 * Faturas do cliente — lista própria, paginada e filtrável.
 *
 * Não vem junto da ficha: um cliente com anos de casa acumula centenas de
 * faturas, e carregá-las na abertura tornaria lenta uma tela que quase sempre
 * é aberta só para conferir um telefone. Quem clica nesta aba está pedindo
 * pelos dados; até lá, nada é buscado.
 */
function InvoicesTab({ clientId }: { clientId: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<EffectiveInvoiceStatus | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data, isPending, isFetching } = useClientInvoices(clientId, status, page);

  function changeStatus(value: string): void {
    setStatus(value === ALL_STATUS ? undefined : (value as EffectiveInvoiceStatus));
    // Voltar para a primeira página é obrigatório: quem estava na página 4 de
    // "todas" e filtra por "Atrasadas" provavelmente tem menos de 4 páginas, e
    // a tela apareceria vazia como se não houvesse fatura atrasada nenhuma.
    setPage(1);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={status ?? ALL_STATUS} onValueChange={changeStatus}>
          <SelectTrigger className="w-[180px]" aria-label="Filtrar faturas por situação">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUS}>Todas as faturas</SelectItem>
            <SelectItem value="PENDING">Pendentes</SelectItem>
            <SelectItem value="OVERDUE">Atrasadas</SelectItem>
            <SelectItem value="PAID">Pagas</SelectItem>
            <SelectItem value="CANCELLED">Canceladas</SelectItem>
          </SelectContent>
        </Select>

        {data && data.total > 0 && (
          <p className="text-xs text-muted-foreground">
            {data.total} {data.total === 1 ? 'fatura' : 'faturas'}
            {status ? ` · ${INVOICE_STATUS_LABELS[status].toLowerCase()}` : ''}
          </p>
        )}
      </div>

      <Card className="overflow-hidden">
        {isPending ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={status ? 'Nenhuma fatura nesta situação' : 'Nenhuma fatura'}
            description={
              status
                ? 'Troque o filtro para ver as demais faturas do cliente.'
                : 'As faturas deste cliente aparecerão aqui.'
            }
            icon={ReceiptText}
            compact
            {...(status
              ? {}
              : {
                  action: (
                    <Button asChild size="sm">
                      <Link to={`/faturas/nova?clienteId=${clientId}`}>
                        <Plus />
                        Nova fatura
                      </Link>
                    </Button>
                  ),
                })}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead className="hidden md:table-cell">Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="hidden sm:table-cell">Em aberto</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/faturas/${invoice.id}`)}
                  >
                    <TableCell className="font-medium">
                      {invoice.number}
                      {invoice.contractNumber && (
                        <p className="text-xs text-muted-foreground">
                          Contrato {invoice.contractNumber}
                        </p>
                      )}
                    </TableCell>

                    <TableCell className="hidden max-w-[240px] truncate md:table-cell">
                      {invoice.description ?? '—'}
                    </TableCell>

                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatCurrency(invoice.amount)}
                    </TableCell>

                    {/* Saldo em aberto ao lado do valor de face: é o que revela
                        o pagamento parcial — uma fatura de R$ 1.200 com R$ 800
                        pagos continua "pendente", e sem esta coluna pareceria
                        intocada. */}
                    <TableCell className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                      {invoice.status === 'CANCELLED' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : Number(invoice.outstanding) === 0 ? (
                        <span className="text-muted-foreground">Quitada</span>
                      ) : (
                        formatCurrency(invoice.outstanding)
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap">
                      {formatDate(invoice.dueDate)}
                    </TableCell>

                    <TableCell>
                      <Badge variant={invoiceBadgeVariant(invoice.status)}>
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPageChange={setPage}
              disabled={isFetching}
            />
          </>
        )}
      </Card>
    </div>
  );
}

function HistoryTab({ clientId }: { clientId: string }) {
  const [page, setPage] = useState(1);
  const { data, isPending } = useClientHistory(clientId, page);

  if (isPending) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Sem alterações registradas"
          description="Toda edição feita neste cliente passa a aparecer aqui."
          icon={History}
          compact
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {data.items.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {CLIENT_HISTORY_ACTION_LABELS[entry.action]}
                {entry.fieldLabel && <span className="text-muted-foreground"> · {entry.fieldLabel}</span>}
              </p>
              {entry.action === 'UPDATED' && <HistoryDiff entry={entry} />}
              <p className="mt-1 text-xs text-muted-foreground">por {entry.userName}</p>
            </div>

            <p className="shrink-0 text-xs text-muted-foreground">
              {formatDateTime(entry.createdAt)}
            </p>
          </li>
        ))}
      </ul>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Página {data.page} de {data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function HistoryDiff({ entry }: { entry: ClientHistoryEntry }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through">
        {entry.oldValue || 'vazio'}
      </span>
      <span className="text-muted-foreground" aria-label="alterado para">
        →
      </span>
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
        {entry.newValue || 'vazio'}
      </span>
    </p>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
