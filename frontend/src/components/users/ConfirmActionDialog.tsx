import { Loader2, Trash2, UserCheck, UserX } from 'lucide-react';

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
import type { User } from '@/types/user';

/**
 * Confirmação das ações que tiram acesso de alguém.
 *
 * Só as que REMOVEM entram aqui. Promover a administrador e reativar uma conta
 * são feitas direto, sem confirmação: são desfazíveis num clique e pedir
 * confirmação para tudo é o caminho mais curto para ninguém ler mais nenhuma
 * confirmação.
 *
 * O texto de cada ação diz o que acontece de CONCRETO — "as sessões abertas
 * são encerradas", "o histórico é preservado" — em vez do genérico "esta ação
 * não pode ser desfeita", que não informa nada.
 */
type Action =
  | { kind: 'deactivate'; user: User }
  | { kind: 'demote'; user: User }
  | { kind: 'delete'; user: User };

interface ConfirmActionDialogProps {
  action: Action;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const COPY: Record<
  Action['kind'],
  { title: (name: string) => string; body: string; button: string; destructive: boolean }
> = {
  deactivate: {
    title: (name) => `Inativar ${name}?`,
    body:
      'A pessoa perde o acesso imediatamente, inclusive nas sessões que estiverem abertas agora. ' +
      'Os pagamentos e alterações que ela registrou continuam no histórico, com o nome dela. ' +
      'A conta pode ser reativada depois.',
    button: 'Inativar',
    destructive: true,
  },
  demote: {
    title: (name) => `Tornar ${name} funcionário?`,
    body:
      'A pessoa deixa de ver o financeiro consolidado do escritório e de gerenciar usuários. ' +
      'Continua atendendo clientes, contratos, faturas e pagamentos. A mudança vale na ' +
      'requisição seguinte, sem precisar sair e entrar de novo.',
    button: 'Tornar funcionário',
    destructive: false,
  },
  delete: {
    title: (name) => `Excluir ${name}?`,
    body:
      'O cadastro é apagado definitivamente. Só é possível para contas sem histórico: quem já ' +
      'registrou pagamentos ou alterou cadastros não pode ser excluído, porque isso apagaria a ' +
      'trilha de auditoria — nesse caso, inative.',
    button: 'Excluir',
    destructive: true,
  },
};

export function ConfirmActionDialog({
  action,
  isPending,
  onConfirm,
  onCancel,
}: ConfirmActionDialogProps) {
  const copy = COPY[action.kind];

  const Icon = action.kind === 'delete' ? Trash2 : action.kind === 'demote' ? UserCheck : UserX;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title(action.user.name)}</AlertDialogTitle>
          <AlertDialogDescription>{copy.body}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>

          {/* Botão comum em vez de AlertDialogAction: a API pode recusar (por
              exemplo, "é o único administrador ativo"), e o Action fecharia o
              diálogo antes de a recusa chegar. */}
          <Button
            variant={copy.destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <Icon />}
            {isPending ? 'Aplicando…' : copy.button}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
