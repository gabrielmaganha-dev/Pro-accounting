import { Loader2, RefreshCw } from 'lucide-react';
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
import { useRenewContract } from '@/hooks/use-contracts';
import type { ContractDetail } from '@/types/contract';
import { formatCurrency, formatDate } from '@/utils/format';
import { maskCurrency, parseCurrency, toCurrencyInput } from '@/utils/mask';

/**
 * Renovação de contrato.
 *
 * Precisa de formulário próprio — e não de uma confirmação simples — porque
 * renovar exige uma informação que só quem negociou tem: até quando. O
 * reajuste vem junto porque é a razão mais comum de uma renovação não ser
 * apenas prorrogação de prazo, e pedi-lo numa segunda tela faria a pessoa
 * renovar e logo em seguida editar o contrato para corrigir o valor.
 *
 * A vigência é ESTENDIDA no mesmo contrato, não recriada em um registro novo:
 * as faturas apontam para o contrato, e parti-lo em dois espalharia o
 * histórico financeiro do mesmo acordo por dois cadastros.
 */

interface RenewContractDialogProps {
  contract: ContractDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenewContractDialog({
  contract,
  open,
  onOpenChange,
}: RenewContractDialogProps) {
  const renewMutation = useRenewContract();

  const [endDate, setEndDate] = useState('');
  const [monthlyValue, setMonthlyValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Repõe os valores toda vez que o diálogo abre.
   *
   * Sem isto, quem cancela uma renovação e abre de novo reencontraria a data
   * que havia digitado antes — e poderia confirmá-la sem perceber que era um
   * resto da tentativa anterior.
   */
  useEffect(() => {
    if (!open) return;

    setEndDate(suggestNextEndDate(contract.endDate));
    setMonthlyValue(toCurrencyInput(contract.monthlyValue));
    setError(null);
  }, [open, contract.endDate, contract.monthlyValue]);

  const currentEnd = contract.endDate;

  function handleConfirm(): void {
    if (!endDate) {
      setError('Informe a nova data de término.');
      return;
    }

    if (currentEnd && endDate <= currentEnd) {
      setError(
        `A nova data precisa ser posterior ao término atual (${formatDate(currentEnd)}).`,
      );
      return;
    }

    const parsedValue = parseCurrency(monthlyValue);

    if (monthlyValue && Number(parsedValue) <= 0) {
      setError('O valor mensal precisa ser maior que zero.');
      return;
    }

    setError(null);

    renewMutation.mutate(
      {
        id: contract.id,
        payload: {
          endDate,
          // Só envia o valor se de fato mudou: mandar o mesmo número de volta
          // seria uma escrita sem efeito.
          ...(parsedValue && parsedValue !== contract.monthlyValue
            ? { monthlyValue: parsedValue }
            : {}),
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  const parsed = parseCurrency(monthlyValue);
  const valueChanged = Boolean(parsed) && parsed !== contract.monthlyValue;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Renovar contrato {contract.number}</AlertDialogTitle>
          <AlertDialogDescription>
            A vigência atual termina em{' '}
            <strong>{currentEnd ? formatDate(currentEnd) : 'data indeterminada'}</strong>. A
            renovação estende este mesmo contrato, preservando todas as faturas já emitidas, e o
            devolve à situação <strong>Ativo</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="renew-end-date">Novo término *</Label>
            <Input
              id="renew-end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={renewMutation.isPending}
              {...(currentEnd ? { min: currentEnd } : {})}
            />
            <p className="text-xs text-muted-foreground">Sugerido: mais 12 meses.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renew-monthly-value">Valor mensal</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="renew-monthly-value"
                inputMode="numeric"
                className="pl-9 tabular-nums"
                value={monthlyValue}
                onChange={(event) => setMonthlyValue(maskCurrency(event.target.value))}
                disabled={renewMutation.isPending}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {valueChanged
                ? `Reajuste de ${formatCurrency(contract.monthlyValue)} para ${formatCurrency(parsed)}.`
                : 'Altere para registrar um reajuste.'}
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={renewMutation.isPending}>Voltar</AlertDialogCancel>

          {/* Botão comum em vez de AlertDialogAction: o Action fecha o diálogo
              ao ser clicado, e aqui a validação pode recusar — fechar levaria
              embora o formulário junto com a mensagem de erro. */}
          <Button onClick={handleConfirm} disabled={renewMutation.isPending}>
            {renewMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {renewMutation.isPending ? 'Renovando…' : 'Renovar contrato'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Sugere o término da renovação: doze meses após o atual.
 *
 * Doze meses porque é o prazo padrão de um contrato de honorários contábeis.
 * Se o término atual já passou, conta a partir de hoje — prorrogar para uma
 * data que também está no passado não renovaria nada.
 */
function suggestNextEndDate(currentEnd: string | null): string {
  const base = currentEnd && currentEnd > todayIso() ? currentEnd : todayIso();
  const [year, month, day] = base.split('-').map(Number);

  if (!year || !month || !day) return '';

  // `Date.UTC` com mês +12 resolve a virada de ano sozinho. O dia 31 em um mês
  // de 30 transborda para o mês seguinte, que é o comportamento aceitável aqui
  // — a data é apenas uma sugestão que o usuário confirma ou ajusta.
  const next = new Date(Date.UTC(year, month - 1 + 12, day));

  return next.toISOString().slice(0, 10);
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}
