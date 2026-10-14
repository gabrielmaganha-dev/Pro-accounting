import { Badge } from '@/components/ui/badge';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_SEVERITY,
  AUDIT_ENTITY_LABELS,
  type AuditAction,
  type AuditEntity,
} from '@/types/audit';

const VARIANT = {
  critical: 'danger',
  warning: 'warning',
  neutral: 'neutral',
} as const;

/**
 * Selo da ação.
 *
 * A cor carrega urgência, mas o TEXTO carrega o significado — como em todo selo
 * do sistema, nenhum estado é comunicado só por cor. Numa trilha de auditoria
 * isso importa mais do que em qualquer outra tela: é onde alguém varre centenas
 * de linhas procurando o que saiu do normal.
 */
export function AuditActionBadge({ action }: { action: AuditAction }) {
  return (
    <Badge variant={VARIANT[AUDIT_ACTION_SEVERITY[action]]}>
      {AUDIT_ACTION_LABELS[action] ?? action}
    </Badge>
  );
}

export function AuditEntityBadge({ entity }: { entity: AuditEntity }) {
  return <Badge variant="outline">{AUDIT_ENTITY_LABELS[entity] ?? entity}</Badge>;
}
