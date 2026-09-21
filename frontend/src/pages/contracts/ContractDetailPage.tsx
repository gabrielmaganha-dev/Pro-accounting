import {
  ArrowLeft,
  Ban,
  Building2,
  CalendarClock,
  FileText,
  FileX,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  SlidersHorizontal,
  SquareArrowOutUpRight,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import { RenewContractDialog } from '@/components/contracts/RenewContractDialog';
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
import { Button, buttonVariants } from '@/components/ui/button';
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
  useContract,
  useContractInvoices,
  useDeleteContract,
  useUpdateContractStatus,
} from '@/hooks/use-contracts';
import { cn } from '@/lib/utils';
import { CONTRACT_STATUS_HINTS } from '@/types/contract';
import {
  CONTRACT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  type EffectiveInvoiceStatus,
} from '@/types/dashboard';
import {
  formatCpfCnpj,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@/utils/format';

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: contract, isPending, isError } = useContract(id);
  const statusMutation = useUpdateContractStatus();
  const deleteMutation = useDeleteContract();

  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  if (isPending) return <DetailSkeleton />;

  if (isError || !contract) {
    return (
      <Card>
        <EmptyState
          title="Contrato não encontrado"
          description="O contrato pode ter sido excluído ou o endereço está incorreto."
          icon={FileX}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/contratos">Voltar para a lista</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const isClosed = contract.status === 'CLOSED';
  const isCancelled = contract.status === 'CANCELLED';
  const hasInvoices = contract.summary.invoices.total > 0;

  return (
    <div className="space-y-5">
      {/* ---------------- Cabeçalho ---------------- */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Voltar">
          <Link to="/contratos">
            <ArrowLeft />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {contract.number}
            </h2>
            <ContractStatusBadge status={contract.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {contract.serviceType} ·{' '}
            <Link
              to={`/clientes/${contract.clientId}`}
              className="font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              {contract.client.name}
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={`/contratos/${contract.id}/editar`}>
              <Pencil />
              Editar
            </Link>
          </Button>

          {/* Encerrar, cancelar, renovar e excluir são exclusivos do
              administrador. O botão nem aparece para o funcionário — e a API
              recusaria de qualquer forma. */}
          {isAdmin && (
            <>
              {!isCancelled && contract.endDate && (
                <Button variant="outline" onClick={() => setRenewOpen(true)}>
                  <RefreshCw />
                  Renovar
                </Button>
              )}

              {!isClosed && !isCancelled && (
                <Button variant="outline" onClick={() => setConfirmClose(true)}>
                  <CalendarClock />
                  Encerrar
                </Button>
              )}

              {!isCancelled && (
                <Button variant="outline" onClick={() => setConfirmCancel(true)}>
                  <Ban className="text-destructive" />
                  Cancelar
                </Button>
              )}

              <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="text-destructive" />
                Excluir
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ---------------- Financeiro ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile
          label="Total faturado"
          value={formatCurrency(contract.summary.amounts.invoiced)}
          hint={`${contract.summary.invoices.total} fatura(s)`}
        />
        <SummaryTile
          label="Total recebido"
          value={formatCurrency(contract.summary.amounts.received)}
          hint={`${contract.summary.invoices.paid} paga(s)`}
          tone="text-emerald-700"
        />
        <SummaryTile
          label="Total pendente"
          value={formatCurrency(contract.summary.amounts.pending)}
          hint={`${contract.summary.invoices.pending} fatura(s)`}
          tone="text-amber-800"
        />
        <SummaryTile
          label="Total atrasado"
          value={formatCurrency(contract.summary.amounts.overdue)}
          hint={`${contract.summary.invoices.overdue} fatura(s)`}
          tone="text-red-700"
        />
      </div>

      {/* ---------------- Abas ---------------- */}
      <Tabs defaultValue="contrato">
        <TabsList>
          <TabsTrigger value="contrato">
            <FileText className="size-4" />
            Contrato
          </TabsTrigger>
          <TabsTrigger value="cliente">
            <UserRound className="size-4" />
            Cliente
          </TabsTrigger>
          <TabsTrigger value="faturas">
            <ReceiptText className="size-4" />
            Faturas ({contract.summary.invoices.total})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contrato">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Informações do contrato</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Número" value={contract.number} />
              <Field label="Tipo de serviço" value={contract.serviceType} />
              <Field
                label="Situação"
                value={CONTRACT_STATUS_LABELS[contract.status]}
                hint={CONTRACT_STATUS_HINTS[contract.status]}
              />

              <Field label="Data de início" value={formatDate(contract.startDate)} />
              <Field
                label="Data de término"
                value={contract.endDate ? formatDate(contract.endDate) : null}
                emptyLabel="Prazo indeterminado"
              />
              <Field label="Dia de vencimento" value={`Dia ${contract.dueDay}`} />

              <Field
                label="Valor mensal"
                value={formatCurrency(contract.monthlyValue)}
                hint={`${formatCurrency(contract.monthlyValue)} por mês`}
              />
              <Field label="Cadastrado em" value={formatDateTime(contract.createdAt)} />
              <Field label="Última atualização" value={formatDateTime(contract.updatedAt)} />

              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Observações" value={contract.notes} multiline />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cliente">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Cliente do contrato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"
                  >
                    <Building2 className="size-5" />
                  </span>

                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{contract.client.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {contract.client.companyName ? `${contract.client.companyName} · ` : ''}
                      {formatCpfCnpj(contract.client.cpfCnpj)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <ClientStatusBadge status={contract.client.status} />

                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/clientes/${contract.clientId}`}>
                      <SquareArrowOutUpRight />
                      Abrir ficha
                    </Link>
                  </Button>
                </div>
              </div>

              {contract.client.status === 'INACTIVE' && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Este cliente está inativo, mas o contrato continua registrado. Inativar um
                  cliente não encerra os contratos dele — se a prestação acabou, encerre o
                  contrato também.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faturas">
          <InvoicesTab contractId={contract.id} />
        </TabsContent>
      </Tabs>

      {/* ---------------- Confirmações ---------------- */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              O contrato <strong>{contract.number}</strong> passa a constar como encerrado e deixa
              de ser contado entre os contratos ativos. As faturas já emitidas permanecem
              intactas, e o histórico financeiro continua acessível nesta tela.
              {(!contract.endDate || contract.endDate > todayIso()) && (
                <>
                  {' '}
                  Como o término {contract.endDate ? 'está no futuro' : 'é indeterminado'}, a data
                  de término será registrada como <strong>hoje</strong>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => statusMutation.mutate({ id: contract.id, status: 'CLOSED' })}
            >
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancelar registra que o contrato <strong>{contract.number}</strong> foi desfeito — é
              diferente de encerrar, que marca um contrato cumprido até o fim. As datas de
              vigência não são alteradas, e um contrato cancelado não pode ser renovado depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: 'destructive' }))}
              onClick={() => statusMutation.mutate({ id: contract.id, status: 'CANCELLED' })}
            >
              Cancelar contrato
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contrato definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação <strong>não pode ser desfeita</strong>.
              {hasInvoices ? (
                <>
                  {' '}
                  Este contrato possui {contract.summary.invoices.total} fatura(s), então{' '}
                  <strong>a exclusão será recusada</strong> — use Encerrar para tirá-lo de
                  operação sem perder o histórico financeiro.
                </>
              ) : (
                ' Como não há faturas vinculadas, o registro será removido por completo.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: 'destructive' }))}
              onClick={() =>
                deleteMutation.mutate(contract.id, {
                  onSuccess: () => navigate('/contratos'),
                })
              }
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RenewContractDialog
        contract={contract}
        open={renewOpen}
        onOpenChange={setRenewOpen}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Data de hoje em `YYYY-MM-DD`, para comparar com as datas da API. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}

/** Valor usado pelo Select para representar "sem filtro". */
const ALL_STATUS = '__all__';

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
        <p
          className={cn(
            'mt-1 truncate text-lg font-semibold tabular-nums',
            tone ?? 'text-foreground',
          )}
        >
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
  hint,
  multiline = false,
  emptyLabel = 'Não informado',
}: {
  label: string;
  value: string | null | undefined;
  hint?: string;
  multiline?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm text-foreground', multiline && 'whitespace-pre-wrap')}>
        {value && value !== '—' ? value : <span className="text-muted-foreground">{emptyLabel}</span>}
      </p>
      {hint && value && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Faturas do contrato — lista própria, paginada e filtrável.
 *
 * Mesmo critério da ficha do cliente: não vem junto do contrato porque um
 * contrato de anos acumula dezenas de faturas, e quem abre a tela quase sempre
 * quer conferir o valor mensal, não percorrer a cobrança toda.
 */
function InvoicesTab({ contractId }: { contractId: string }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<EffectiveInvoiceStatus | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data, isPending, isFetching } = useContractInvoices(contractId, status, page);

  function changeStatus(value: string): void {
    setStatus(value === ALL_STATUS ? undefined : (value as EffectiveInvoiceStatus));
    // Voltar para a primeira página é obrigatório: quem estava na página 3 de
    // "todas" e filtra por "Atrasadas" provavelmente tem menos de 3 páginas, e
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
                ? 'Troque o filtro para ver as demais faturas do contrato.'
                : 'As faturas emitidas a partir deste contrato aparecerão aqui.'
            }
            icon={ReceiptText}
            compact
            {...(status
              ? {}
              : {
                  action: (
                    <Button asChild size="sm">
                      <Link to={`/faturas/nova?contratoId=${contractId}`}>
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
                    <TableCell className="font-medium whitespace-nowrap">
                      {invoice.number}
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
