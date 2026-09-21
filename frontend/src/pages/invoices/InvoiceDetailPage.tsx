import {
  ArrowLeft,
  Ban,
  Building2,
  CircleDollarSign,
  FileText,
  History,
  ReceiptText,
  RotateCcw,
  SquareArrowOutUpRight,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { EmptyState } from '@/components/common/EmptyState';
import { ContractStatusBadge } from '@/components/contracts/ContractStatusBadge';
import { InvoiceStatusBadge } from '@/components/invoices/InvoiceStatusBadge';
import { RegisterPaymentDialog } from '@/components/invoices/RegisterPaymentDialog';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  useDeleteInvoice,
  useInvoice,
  useInvoiceHistory,
  useInvoicePayments,
  useRemovePayment,
  useUpdateInvoiceStatus,
} from '@/hooks/use-invoices';
import { cn } from '@/lib/utils';
import { PAYMENT_METHOD_LABELS } from '@/types/dashboard';
import {
  INVOICE_HISTORY_ACTION_LABELS,
  type Invoice,
  type InvoiceHistoryEntry,
} from '@/types/invoice';
import {
  formatCpfCnpj,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@/utils/format';

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: invoice, isPending, isError } = useInvoice(id);
  const statusMutation = useUpdateInvoiceStatus();
  const deleteMutation = useDeleteInvoice();

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isAdmin = user?.role === 'ADMIN';

  if (isPending) return <DetailSkeleton />;

  if (isError || !invoice) {
    return (
      <Card>
        <EmptyState
          title="Fatura não encontrada"
          description="A fatura pode ter sido excluída ou o endereço está incorreto."
          icon={ReceiptText}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/faturas">Voltar para a lista</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const isCancelled = invoice.storedStatus === 'CANCELLED';
  const isSettled = Number(invoice.outstanding) === 0;
  const canReceivePayment = !isCancelled && !isSettled;

  return (
    <div className="space-y-5">
      {/* ---------------- Cabeçalho ---------------- */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Voltar">
          <Link to="/faturas">
            <ArrowLeft />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {invoice.number}
            </h2>
            <InvoiceStatusBadge status={invoice.status} daysOverdue={invoice.daysOverdue} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link
              to={`/clientes/${invoice.clientId}`}
              className="font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              {invoice.client.name}
            </Link>
            {invoice.description ? ` · ${invoice.description}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Registrar pagamento é a ação principal da tela — por isso é o
              único botão em destaque, e some quando não faz sentido. */}
          {canReceivePayment && (
            <Button onClick={() => setPaymentOpen(true)}>
              <CircleDollarSign />
              Registrar pagamento
            </Button>
          )}

          {!isCancelled && (
            <Button variant="outline" asChild>
              <Link to={`/faturas/${invoice.id}/editar`}>Editar</Link>
            </Button>
          )}

          {isAdmin && (
            <>
              {isCancelled ? (
                <Button variant="outline" onClick={() => setConfirmReopen(true)}>
                  <RotateCcw />
                  Reabrir
                </Button>
              ) : (
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
        <SummaryTile label="Valor da fatura" value={formatCurrency(invoice.amount)} />
        <SummaryTile
          label="Recebido"
          value={formatCurrency(invoice.paidAmount)}
          hint={`${invoice.paymentCount} pagamento(s)`}
          tone="text-emerald-700"
        />
        <SummaryTile
          label="Em aberto"
          value={isCancelled ? '—' : formatCurrency(invoice.outstanding)}
          hint={isCancelled ? 'Fatura cancelada' : isSettled ? 'Quitada' : undefined}
          tone={isSettled || isCancelled ? 'text-muted-foreground' : 'text-amber-800'}
        />
        <SummaryTile
          label="Vencimento"
          value={formatDate(invoice.dueDate)}
          hint={dueHint(invoice)}
          tone={invoice.status === 'OVERDUE' ? 'text-red-700' : 'text-foreground'}
        />
      </div>

      {/* ---------------- Abas ---------------- */}
      <Tabs defaultValue="fatura">
        <TabsList>
          <TabsTrigger value="fatura">
            <ReceiptText className="size-4" />
            Fatura
          </TabsTrigger>
          <TabsTrigger value="pagamentos">
            <CircleDollarSign className="size-4" />
            Pagamentos ({invoice.paymentCount})
          </TabsTrigger>
          <TabsTrigger value="vinculos">
            <Building2 className="size-4" />
            Cliente e contrato
          </TabsTrigger>
          <TabsTrigger value="historico">
            <History className="size-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fatura">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Dados da fatura</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Número" value={invoice.number} />
              <Field label="Valor" value={formatCurrency(invoice.amount)} />
              <Field label="Situação" value={statusExplanation(invoice)} />

              <Field label="Data de emissão" value={formatDate(invoice.issueDate)} />
              <Field label="Vencimento" value={formatDate(invoice.dueDate)} />
              <Field
                label="Último pagamento"
                value={invoice.lastPaymentDate ? formatDate(invoice.lastPaymentDate) : null}
                emptyLabel="Nenhum pagamento"
              />

              <Field
                label="Contrato"
                value={invoice.contract ? invoice.contract.number : null}
                emptyLabel="Fatura avulsa"
              />
              <Field label="Emitida em" value={formatDateTime(invoice.createdAt)} />
              <Field label="Última atualização" value={formatDateTime(invoice.updatedAt)} />

              <div className="sm:col-span-2 lg:col-span-3">
                <Field label="Descrição" value={invoice.description} multiline />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagamentos">
          <PaymentsTab invoice={invoice} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="vinculos">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Cliente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{invoice.client.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {invoice.client.companyName ? `${invoice.client.companyName} · ` : ''}
                      {formatCpfCnpj(invoice.client.cpfCnpj)}
                    </p>
                  </div>
                  <ClientStatusBadge status={invoice.client.status} />
                </div>

                <Button variant="outline" size="sm" asChild>
                  <Link to={`/clientes/${invoice.clientId}`}>
                    <SquareArrowOutUpRight />
                    Abrir ficha do cliente
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Contrato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {invoice.contract ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {invoice.contract.number}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {invoice.contract.serviceType}
                        </p>
                      </div>
                      <ContractStatusBadge status={invoice.contract.status} />
                    </div>

                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/contratos/${invoice.contractId}`}>
                        <SquareArrowOutUpRight />
                        Abrir contrato
                      </Link>
                    </Button>
                  </>
                ) : (
                  <EmptyState
                    title="Fatura avulsa"
                    description="Esta cobrança não veio de um contrato — é um serviço pontual."
                    icon={FileText}
                    compact
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="historico">
          <HistoryTab invoiceId={invoice.id} />
        </TabsContent>
      </Tabs>

      {/* ---------------- Diálogos ---------------- */}
      <RegisterPaymentDialog
        invoice={invoice}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              A fatura <strong>{invoice.number}</strong> sai do faturamento e deixa de ser
              cobrada, mas o documento e o histórico permanecem — que é justamente a diferença
              para excluir.
              {invoice.paymentCount > 0 && (
                <>
                  {' '}
                  Esta fatura tem {invoice.paymentCount} pagamento(s) registrado(s), então{' '}
                  <strong>o cancelamento será recusado</strong>: estorne os pagamentos antes,
                  para que o valor recebido não desapareça do financeiro.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: 'destructive' }))}
              onClick={() => statusMutation.mutate({ id: invoice.id, status: 'CANCELLED' })}
            >
              Cancelar fatura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReopen} onOpenChange={setConfirmReopen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              A fatura <strong>{invoice.number}</strong> volta ao faturamento. Como o
              vencimento é {formatDate(invoice.dueDate)}, ela reaparecerá como{' '}
              <strong>
                {invoice.dueDate < todayIso() ? 'atrasada' : 'pendente'}
              </strong>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => statusMutation.mutate({ id: invoice.id, status: 'PENDING' })}
            >
              Reabrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fatura definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação <strong>não pode ser desfeita</strong>.
              {invoice.paymentCount > 0 ? (
                <>
                  {' '}
                  Esta fatura possui {invoice.paymentCount} pagamento(s), então{' '}
                  <strong>a exclusão será recusada</strong> — cancele a fatura para tirá-la do
                  faturamento sem perder o histórico financeiro.
                </>
              ) : (
                ' Como não há pagamentos registrados, o documento será removido por completo. ' +
                'Prefira cancelar se a fatura chegou a ser enviada ao cliente.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: 'destructive' }))}
              onClick={() =>
                deleteMutation.mutate(invoice.id, {
                  onSuccess: () => navigate('/faturas'),
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

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}

/** Legenda do card de vencimento: quantos dias faltam ou já passaram. */
function dueHint(invoice: Invoice): string | undefined {
  if (invoice.storedStatus === 'CANCELLED') return undefined;
  if (invoice.status === 'PAID') return 'Quitada';

  if (invoice.daysOverdue > 0) {
    return `Vencida há ${invoice.daysOverdue} ${invoice.daysOverdue === 1 ? 'dia' : 'dias'}`;
  }

  if (invoice.daysOverdue === 0) return 'Vence hoje';

  const remaining = Math.abs(invoice.daysOverdue);
  return `Faltam ${remaining} ${remaining === 1 ? 'dia' : 'dias'}`;
}

/**
 * Explica a situação em uma frase.
 *
 * O selo diz "Atrasada"; esta linha diz POR QUE está atrasada. Num documento
 * de cobrança, quem atende o telefone do cliente precisa da razão, não só do
 * rótulo.
 */
function statusExplanation(invoice: Invoice): string {
  switch (invoice.status) {
    case 'CANCELLED':
      return 'Cancelada — fora do faturamento';
    case 'PAID':
      return 'Paga — quitada integralmente';
    case 'OVERDUE':
      return `Atrasada — venceu em ${formatDate(invoice.dueDate)}`;
    default:
      return Number(invoice.paidAmount) > 0
        ? 'Pendente — com pagamento parcial'
        : 'Pendente — dentro do prazo';
  }
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
  multiline = false,
  emptyLabel = 'Não informado',
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-sm text-foreground', multiline && 'whitespace-pre-wrap')}>
        {value && value !== '—' ? (
          value
        ) : (
          <span className="text-muted-foreground">{emptyLabel}</span>
        )}
      </p>
    </div>
  );
}

/** Lista de pagamentos, com estorno para administradores. */
function PaymentsTab({ invoice, isAdmin }: { invoice: Invoice; isAdmin: boolean }) {
  const { data: payments, isPending } = useInvoicePayments(invoice.id);
  const removeMutation = useRemovePayment();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (isPending) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nenhum pagamento registrado"
          description={
            invoice.storedStatus === 'CANCELLED'
              ? 'Esta fatura foi cancelada antes de receber qualquer pagamento.'
              : 'Use o botão "Registrar pagamento" quando o valor entrar.'
          }
          icon={CircleDollarSign}
          compact
        />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Forma</TableHead>
            <TableHead className="hidden md:table-cell">Registrado por</TableHead>
            <TableHead className="hidden lg:table-cell">Observações</TableHead>
            {isAdmin && <TableHead className="w-[100px] text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id}>
              <TableCell className="whitespace-nowrap">
                {formatDate(payment.paymentDate)}
              </TableCell>
              <TableCell className="whitespace-nowrap font-medium tabular-nums text-emerald-700">
                {formatCurrency(payment.amount)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap md:table-cell">
                {payment.registeredByName}
              </TableCell>
              <TableCell className="hidden max-w-[220px] truncate lg:table-cell">
                {payment.notes ?? <span className="text-muted-foreground">—</span>}
              </TableCell>
              {isAdmin && (
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmId(payment.id)}
                    aria-label="Estornar pagamento"
                  >
                    <Undo2 />
                    Estornar
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={confirmId !== null} onOpenChange={() => setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Estornar pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O lançamento é removido e a fatura volta a constar em aberto pelo valor
              correspondente. O estorno fica registrado no histórico, com o seu nome — é assim
              que a correção continua auditável.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: 'destructive' }))}
              onClick={() => {
                if (confirmId) {
                  removeMutation.mutate({ id: invoice.id, paymentId: confirmId });
                }
              }}
            >
              Estornar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function HistoryTab({ invoiceId }: { invoiceId: string }) {
  const [page, setPage] = useState(1);
  const { data, isPending } = useInvoiceHistory(invoiceId, page);

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
          title="Sem eventos registrados"
          description="Toda alteração e todo pagamento desta fatura passam a aparecer aqui."
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
                {INVOICE_HISTORY_ACTION_LABELS[entry.action]}
                {entry.action === 'UPDATED' && entry.fieldLabel && (
                  <span className="text-muted-foreground"> · {entry.fieldLabel}</span>
                )}
              </p>
              <HistoryDetail entry={entry} />
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

/**
 * Detalhe de cada evento.
 *
 * Pagamento mostra o valor; alteração mostra o antes e o depois. Um formato só
 * para os dois obrigaria a ler "de vazio para 500,00" num lançamento de
 * pagamento, que não é uma alteração de campo.
 */
function HistoryDetail({ entry }: { entry: InvoiceHistoryEntry }) {
  if (entry.action === 'PAYMENT_ADDED' && entry.newValue) {
    return (
      <p className="mt-1 text-xs">
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium tabular-nums text-emerald-700">
          + {formatCurrency(entry.newValue)}
        </span>
      </p>
    );
  }

  if (entry.action === 'PAYMENT_REMOVED' && entry.oldValue) {
    return (
      <p className="mt-1 text-xs">
        <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium tabular-nums text-red-700">
          − {formatCurrency(entry.oldValue)}
        </span>
      </p>
    );
  }

  if (entry.action !== 'UPDATED') return null;

  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through">
        {formatHistoryValue(entry.field, entry.oldValue)}
      </span>
      <span className="text-muted-foreground" aria-label="alterado para">
        →
      </span>
      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
        {formatHistoryValue(entry.field, entry.newValue)}
      </span>
    </p>
  );
}

/** Formata o valor do histórico conforme o campo, para não exibir dado cru. */
function formatHistoryValue(field: string | null, value: string | null): string {
  if (!value) return 'vazio';
  if (field === 'amount') return formatCurrency(value);
  if (field === 'issueDate' || field === 'dueDate') return formatDate(value);

  return value;
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
