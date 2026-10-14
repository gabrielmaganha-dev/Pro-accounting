import { AlertTriangle, Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { useResetUserPassword } from '@/hooks/use-users';
import type { User } from '@/types/user';

/**
 * Reset de acesso, em duas etapas: confirmar e anotar.
 *
 * A segunda etapa NÃO é um aviso que some sozinho. A senha provisória aparece
 * uma única vez — não é gravada em texto puro, não há rota que a recupere, e o
 * cache da listagem não a guarda. Um toast de cinco segundos perderia a senha
 * de quem piscou, e o administrador refaria o reset sem entender por quê.
 *
 * Por isso o diálogo de resultado não fecha ao clicar fora nem no Esc: só sai
 * por um clique deliberado em "Já anotei".
 */
interface ResetAccessDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetAccessDialog({ user, open, onOpenChange }: ResetAccessDialogProps) {
  const resetMutation = useResetUserPassword();

  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) return;

    // Limpa ao fechar — e não ao abrir — para que a senha não continue na
    // memória do componente depois que o administrador terminou.
    setTemporaryPassword(null);
    setCopied(false);
  }, [open]);

  function handleConfirm(): void {
    resetMutation.mutate(user.id, {
      onSuccess: (result) => setTemporaryPassword(result.temporaryPassword),
    });
  }

  async function handleCopy(): Promise<void> {
    if (!temporaryPassword) return;

    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Área de transferência bloqueada (contexto não seguro, permissão
      // negada): a senha continua visível na tela para ser copiada à mão.
      toast.error('Não foi possível copiar. Anote a senha manualmente.');
    }
  }

  // ---- Etapa 2: a senha gerada -------------------------------------------
  if (temporaryPassword) {
    return (
      <AlertDialog open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Senha provisória de {user.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta senha aparece <strong>uma única vez</strong>. Ela não fica guardada em lugar
              nenhum e não há como consultá-la depois — se perdê-la, basta resetar o acesso de
              novo.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Senha provisória
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              {/* Fonte monoespaçada e seleção fácil: esta senha vai ser lida em
                  voz alta ou copiada, e caracteres ambíguos numa fonte
                  proporcional são a forma clássica de errar. */}
              <code className="select-all break-all font-mono text-lg font-semibold tracking-wider text-foreground">
                {temporaryPassword}
              </code>

              <Button variant="outline" size="sm" onClick={() => void handleCopy()}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Entregue a senha a {user.name} por um canal que só ela acesse. No primeiro login o
              sistema vai exigir a troca, e as sessões que estavam abertas nesta conta já foram
              encerradas.
            </p>
          </div>

          <AlertDialogFooter>
            <Button onClick={() => onOpenChange(false)}>Já anotei</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // ---- Etapa 1: confirmação ----------------------------------------------
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resetar o acesso de {user.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            O sistema vai gerar uma senha provisória e mostrá-la a você uma única vez. A senha
            atual deixa de funcionar imediatamente e qualquer sessão aberta nesta conta é
            encerrada.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={resetMutation.isPending}>Cancelar</AlertDialogCancel>

          <Button onClick={handleConfirm} disabled={resetMutation.isPending}>
            {resetMutation.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {resetMutation.isPending ? 'Gerando…' : 'Resetar acesso'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
