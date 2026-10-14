import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { AuditActionBadge, AuditEntityBadge } from '@/components/audit/AuditActionBadge';
import type { AuditLog } from '@/types/audit';
import { formatDateTime } from '@/utils/format';

/**
 * Detalhe de uma linha da trilha.
 *
 * Existe porque IP, navegador e o objeto de metadata não cabem numa tabela sem
 * deixá-la ilegível — mas são exatamente o que se quer ver ao investigar uma
 * linha suspeita. A tabela mostra o que serve para varrer; o diálogo, o que
 * serve para entender.
 */
interface AuditDetailDialogProps {
  log: AuditLog;
  onClose: () => void;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[150px_1fr] sm:gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export function AuditDetailDialog({ log, onClose }: AuditDetailDialogProps) {
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex flex-wrap items-center gap-2">
            <AuditActionBadge action={log.action} />
            <AuditEntityBadge entity={log.entity} />
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-3">
          <Campo label="Quando">{formatDateTime(log.createdAt)}</Campo>

          <Campo label="Quem">
            {log.userName || log.userEmail ? (
              <>
                {log.userName && <span className="font-medium">{log.userName}</span>}
                {log.userName && log.userEmail && ' · '}
                {log.userEmail}
                {/* O vínculo nulo com a conta é informação, não defeito: quer
                    dizer que a conta foi excluída depois, ou que a ação nem
                    tinha sessão (tentativa de login recusada). */}
                {log.userId === null && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (conta excluída ou sem sessão)
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Campo>

          <Campo label="Registro">
            {log.entityLabel ?? <span className="text-muted-foreground">—</span>}
            {log.entityId && (
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{log.entityId}</p>
            )}
          </Campo>

          <Campo label="Origem">
            <span className="font-mono">{log.ip ?? '—'}</span>
          </Campo>

          {log.userAgent && (
            <Campo label="Cliente">
              <p className="break-all text-xs text-muted-foreground">{log.userAgent}</p>
            </Campo>
          )}

          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <Campo label="Dados da alteração">
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            </Campo>
          )}
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
