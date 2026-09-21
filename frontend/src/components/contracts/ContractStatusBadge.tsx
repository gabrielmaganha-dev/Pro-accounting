import { Badge } from '@/components/ui/badge';
import { CONTRACT_STATUS_LABELS, type ContractStatus } from '@/types/dashboard';

/**
 * Selo de situação do contrato.
 *
 * Cinco estados, quatro cores: **Encerrado e Cancelado compartilham o cinza**,
 * porque ambos significam "fora de operação" e a diferença entre eles é
 * histórica, não operacional. Gastar uma cor de alerta com "Encerrado" daria a
 * um desfecho normal — o contrato chegou ao fim — o mesmo peso visual de um
 * problema.
 *
 * O texto acompanha a cor sempre. Nenhum estado é comunicado apenas por cor:
 * âmbar e vermelho são indistinguíveis para parte dos usuários.
 */
const VARIANTS: Record<ContractStatus, { variant: 'success' | 'warning' | 'default' | 'neutral'; dot: string }> = {
  ACTIVE: { variant: 'success', dot: 'bg-emerald-600' },
  PENDING: { variant: 'warning', dot: 'bg-amber-600' },
  RENEWAL: { variant: 'default', dot: 'bg-brand-600' },
  CLOSED: { variant: 'neutral', dot: 'bg-slate-400' },
  CANCELLED: { variant: 'neutral', dot: 'bg-slate-400' },
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const { variant, dot } = VARIANTS[status];

  return (
    <Badge variant={variant}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {CONTRACT_STATUS_LABELS[status]}
    </Badge>
  );
}
