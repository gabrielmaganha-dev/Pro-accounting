import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
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
import { useAuth } from '@/hooks/use-auth';
import { useChangeOwnPassword } from '@/hooks/use-users';
import { validatePassword } from '@/utils/password-policy';

/**
 * Troca da própria senha.
 *
 * Serve a dois momentos com a mesma lógica:
 *
 *  • voluntário — o item "Alterar senha" do menu do usuário;
 *  • obrigatório — logo após entrar com uma senha provisória. Neste caso o
 *    diálogo não oferece saída: não há botão Cancelar, e clicar fora ou apertar
 *    Esc não fecha.
 *
 * A obrigatoriedade é de INTERFACE, não da API — e isso é uma escolha, não um
 * descuido. Bloquear todas as rotas de quem tem senha provisória exigiria um
 * guard em cada endpoint e transformaria um esquecimento em conta travada. A
 * senha provisória protege contra ela virar permanente, não contra a própria
 * pessoa, que já é a dona legítima da conta.
 */
interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem saída: usado quando a senha em uso é provisória. */
  required?: boolean;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
  required = false,
}: ChangePasswordDialogProps) {
  const { renewSession } = useAuth();
  const changeMutation = useChangeOwnPassword(renewSession);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setVisible(false);
    setError(null);
  }, [open]);

  function handleSubmit(): void {
    if (currentPassword.length === 0) {
      setError('Informe a senha atual.');
      return;
    }

    const policyError = validatePassword(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }

    if (newPassword === currentPassword) {
      setError('A nova senha precisa ser diferente da atual.');
      return;
    }

    // Confere a repetição no navegador: é o erro que a API não tem como pegar,
    // porque ela recebe um campo só.
    if (newPassword !== confirmation) {
      setError('A confirmação não confere com a nova senha.');
      return;
    }

    setError(null);

    changeMutation.mutate(
      { currentPassword, newPassword },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  const isPending = changeMutation.isPending;

  const fields: { id: string; label: string; value: string; set: (value: string) => void }[] = [
    {
      id: 'current-password',
      label: required ? 'Senha provisória *' : 'Senha atual *',
      value: currentPassword,
      set: setCurrentPassword,
    },
    { id: 'new-password', label: 'Nova senha *', value: newPassword, set: setNewPassword },
    {
      id: 'confirm-password',
      label: 'Repita a nova senha *',
      value: confirmation,
      set: setConfirmation,
    },
  ];

  return (
    <AlertDialog open={open} {...(required ? {} : { onOpenChange })}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {required ? 'Defina uma senha para a sua conta' : 'Alterar senha'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {required
              ? 'Você entrou com uma senha provisória, conhecida por quem a gerou. Escolha agora uma senha que só você saiba.'
              : 'Ao confirmar, as outras sessões abertas nesta conta são encerradas. Esta continua ativa.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <Label htmlFor={field.id}>{field.label}</Label>
              <div className="relative">
                <Input
                  id={field.id}
                  type={visible ? 'text' : 'password'}
                  value={field.value}
                  onChange={(event) => field.set(event.target.value)}
                  className="pr-10"
                  disabled={isPending}
                  autoComplete={field.id === 'current-password' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setVisible((value) => !value)}
                  className="absolute right-0.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={visible ? 'Ocultar senhas' : 'Mostrar senhas'}
                >
                  {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Mínimo de 8 caracteres, com ao menos uma letra e um número.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          {!required && <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>}

          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
            {isPending ? 'Alterando…' : 'Alterar senha'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
