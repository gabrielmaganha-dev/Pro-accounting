import { Badge } from '@/components/ui/badge';
import { INVOICE_STATUS_LABELS, type EffectiveInvoiceStatus } from '@/types/dashboard';

/**
 * Selo de situação da fatura.
 *
 * As quatro situações mapeiam direto nas quatro variantes do sistema. O texto
 * acompanha a cor sempre: âmbar (pendente) e vermelho (atrasada) são
 * indistinguíveis para parte dos usuários, e essa é justamente a distinção que
 * decide se alguém liga cobrando hoje ou só na semana que vem.
 */
const VARIANTS: Record<
  EffectiveInvoiceStatus,
  { variant: 'success' | 'warning' | 'danger' | 'neutral'; dot: string }
> = {
  PAID: { variant: 'success', dot: 'bg-emerald-600' },
  PENDING: { variant: 'warning', dot: 'bg-amber-600' },
  OVERDUE: { variant: 'danger', dot: 'bg-red-600' },
  CANCELLED: { variant: 'neutral', dot: 'bg-slate-400' },
};

interface InvoiceStatusBadgeProps {
  status: EffectiveInvoiceStatus;
  /**
   * Dias de atraso. Quando positivo e a fatura está atrasada, vira sufixo —
   * "Atrasada · 12 dias" responde a urgência sem obrigar o usuário a calcular
   * de cabeça a diferença entre o vencimento e hoje.
   */
  daysOverdue?: number;
}

export function InvoiceStatusBadge({ status, daysOverdue }: InvoiceStatusBadgeProps) {
  const { variant, dot } = VARIANTS[status];
  const showDays = status === 'OVERDUE' && daysOverdue !== undefined && daysOverdue > 0;

  return (
    <Badge variant={variant}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {INVOICE_STATUS_LABELS[status]}
      {showDays && (
        <span className="font-normal opacity-80">
          · {daysOverdue} {daysOverdue === 1 ? 'dia' : 'dias'}
        </span>
      )}
    </Badge>
  );
}
