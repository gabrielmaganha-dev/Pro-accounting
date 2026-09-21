import { AlertTriangle, ArrowLeft, CircleDollarSign, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useRegisterPayment } from '@/hooks/use-invoices';
import { ApiError } from '@/services/api';
import { PAYMENT_METHOD_LABELS } from '@/types/dashboard';
import { PAYMENT_METHOD_OPTIONS, type Invoice, type PaymentMethod } from '@/types/invoice';
import { formatCurrency, formatDate } from '@/utils/format';
import { maskCurrency, parseCurrency, toCurrencyInput } from '@/utils/mask';

/**
 * Registro de pagamento, em duas etapas: preencher e confirmar.
 *
 * A confirmação existe porque lançar dinheiro é irreversível na prática — o
 * estorno corrige, mas deixa rastro e exige administrador. Uma tela de revisão
 * antes de gravar custa um clique e evita o erro mais comum, que é confirmar
 * um valor ou uma data que ficaram de uma tentativa anterior.
 *
 * O campo de valor vem preenchido com o SALDO EM ABERTO, não com o valor de
 * face. Na maioria dos casos o cliente paga o que deve, e numa fatura com
 * pagamento parcial anterior o valor de face estaria errado — o usuário teria
 * de subtrair de cabeça.
 */

type Step = 'form' | 'confirm';

interface RegisterPaymentDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RegisterPaymentDialog({
  invoice,
  open,
  onOpenChange,
}: RegisterPaymentDialogProps) {
  const paymentMutation = useRegisterPayment();

  const [step, setStep] = useState<Step>('form');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Preenchido quando a API recusa por duplicata — habilita o "registrar assim mesmo". */
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  /**
   * Repõe tudo toda vez que o diálogo abre.
   *
   * Sem isto, quem cancela um lançamento e abre de novo reencontraria o valor
   * digitado antes — e poderia confirmá-lo sem perceber que era um resto da
   * tentativa anterior.
   */
  useEffect(() => {
    if (!open) return;

    setStep('form');
    setAmount(toCurrencyInput(invoice.outstanding));
    setPaymentDate(todayIso());
    setPaymentMethod('PIX');
    setNotes('');
    setError(null);
    setDuplicateWarning(null);
  }, [open, invoice.outstanding]);

  const parsed = parseCurrency(amount);
  const paidCents = Math.round(Number(parsed || '0') * 100);
  const outstandingCents = Math.round(Number(invoice.outstanding) * 100);
  const isPartial = paidCents > 0 && paidCents < outstandingCents;
  const remainingCents = outstandingCents - paidCents;

  /** Valida e avança para a revisão. Nada é enviado nesta etapa. */
  function handleReview(): void {
    if (!parsed || paidCents <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }

    if (paidCents > outstandingCents) {
      setError(
        `O valor excede o saldo em aberto de ${formatCurrency(invoice.outstanding)}. ` +
          'Ajuste o valor ou lance em duas parcelas.',
      );
      return;
    }

    if (!paymentDate) {
      setError('Informe a data do pagamento.');
      return;
    }

    setError(null);
    setStep('confirm');
  }

  function handleConfirm(confirmDuplicate = false): void {
    setError(null);

    paymentMutation.mutate(
      {
        id: invoice.id,
        payload: {
          amount: parsed,
          paymentDate,
          paymentMethod,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
        },
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (mutationError) => {
          /**
           * 409 aqui é a recusa por duplicata. Em vez de só mostrar o toast de
           * erro e deixar a pessoa sem saída, o diálogo permanece aberto e
           * oferece o "registrar assim mesmo" — que é a única forma de lançar
           * dois pagamentos legitimamente idênticos.
           */
          if (mutationError instanceof ApiError && mutationError.status === 409) {
            setDuplicateWarning(mutationError.message);
          }
        },
      },
    );
  }

  const isBusy = paymentMutation.isPending;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {step === 'form' ? 'Registrar pagamento' : 'Confirmar pagamento'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Fatura <strong>{invoice.number}</strong> — {invoice.client.name}. Valor de face{' '}
            {formatCurrency(invoice.amount)}, saldo em aberto{' '}
            <strong>{formatCurrency(invoice.outstanding)}</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === 'form' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Valor recebido *</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  R$
                </span>
                <Input
                  id="payment-amount"
                  inputMode="numeric"
                  className="pl-9 tabular-nums"
                  value={amount}
                  onChange={(event) => setAmount(maskCurrency(event.target.value))}
                  disabled={isBusy}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {isPartial
                  ? `Pagamento parcial — restarão ${formatCurrency((remainingCents / 100).toFixed(2))}.`
                  : 'Preenchido com o saldo em aberto.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="payment-date">Data do pagamento *</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                disabled={isBusy}
              />
              <p className="text-xs text-muted-foreground">
                Quando o dinheiro entrou, não quando está sendo lançado.
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="payment-method">Forma de pagamento *</Label>
              <Select
                value={paymentMethod}
                onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                disabled={isBusy}
              >
                <SelectTrigger id="payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="payment-notes">Observação</Label>
              <Textarea
                id="payment-notes"
                rows={2}
                placeholder="Ex.: comprovante enviado por e-mail."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={isBusy}
              />
            </div>
          </div>
        ) : (
          <ConfirmationSummary
            amount={parsed}
            paymentDate={paymentDate}
            paymentMethod={paymentMethod}
            notes={notes}
            isPartial={isPartial}
            remaining={(remainingCents / 100).toFixed(2)}
            duplicateWarning={duplicateWarning}
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          {step === 'form' ? (
            <>
              <AlertDialogCancel disabled={isBusy}>Voltar</AlertDialogCancel>
              <Button onClick={handleReview} disabled={isBusy}>
                Revisar
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep('form');
                  setDuplicateWarning(null);
                }}
                disabled={isBusy}
              >
                <ArrowLeft />
                Corrigir
              </Button>

              {/* Botão comum em vez de AlertDialogAction: o Action fecha o
                  diálogo ao ser clicado, e aqui a gravação pode ser recusada —
                  fechar levaria embora o aviso de duplicata junto. */}
              <Button
                onClick={() => handleConfirm(duplicateWarning !== null)}
                disabled={isBusy}
                variant={duplicateWarning ? 'destructive' : 'default'}
              >
                {isBusy ? <Loader2 className="animate-spin" /> : <CircleDollarSign />}
                {isBusy
                  ? 'Registrando…'
                  : duplicateWarning
                    ? 'Registrar assim mesmo'
                    : 'Confirmar e registrar'}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Revisão do que será gravado, antes de confirmar. */
function ConfirmationSummary({
  amount,
  paymentDate,
  paymentMethod,
  notes,
  isPartial,
  remaining,
  duplicateWarning,
}: {
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes: string;
  isPartial: boolean;
  remaining: string;
  duplicateWarning: string | null;
}) {
  return (
    <div className="space-y-3">
      <dl className="divide-y divide-border rounded-md border border-border">
        <Row label="Valor">
          <span className="font-semibold tabular-nums text-emerald-700">
            {formatCurrency(amount)}
          </span>
        </Row>
        <Row label="Data">{formatDate(paymentDate)}</Row>
        <Row label="Forma">{PAYMENT_METHOD_LABELS[paymentMethod]}</Row>
        {notes.trim() && <Row label="Observação">{notes.trim()}</Row>}
      </dl>

      <p className="text-xs text-muted-foreground">
        {isPartial
          ? `Este é um pagamento PARCIAL: a fatura continuará em aberto com ${formatCurrency(remaining)}.`
          : 'Este pagamento quita a fatura, que passará a constar como Paga.'}
      </p>

      {duplicateWarning && (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div className="text-xs text-amber-900">
            <p className="font-medium">Possível pagamento duplicado</p>
            <p className="mt-0.5">{duplicateWarning}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}
