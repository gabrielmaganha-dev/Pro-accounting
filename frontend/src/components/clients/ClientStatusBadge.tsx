import { Badge } from '@/components/ui/badge';
import { CLIENT_STATUS_LABELS, type ClientStatus } from '@/types/client';

/**
 * Selo de situação do cliente.
 *
 * O texto acompanha a cor sempre. Verde e cinza são distinguíveis por quem
 * tem daltonismo, mas a regra vale para todo o sistema: nenhum estado é
 * comunicado apenas por cor.
 */
export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'neutral'}>
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${status === 'ACTIVE' ? 'bg-emerald-600' : 'bg-slate-400'}`}
      />
      {CLIENT_STATUS_LABELS[status]}
    </Badge>
  );
}
