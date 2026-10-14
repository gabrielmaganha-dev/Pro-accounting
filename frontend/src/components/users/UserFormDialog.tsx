import { Eye, EyeOff, Loader2, Save, UserPlus } from 'lucide-react';
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
import { useCreateUser, useUpdateUser } from '@/hooks/use-users';
import { ROLE_LABELS, type UserRole } from '@/types/auth';
import { ROLE_DESCRIPTIONS, USER_ROLE_OPTIONS, type User } from '@/types/user';
import { validatePassword } from '@/utils/password-policy';

/**
 * Cadastro e edição de usuário, no mesmo diálogo.
 *
 * O que muda entre os dois modos NÃO é só o texto do botão:
 *
 *  • senha só existe na criação. Editar não troca senha de ninguém — para isso
 *    existe "Resetar acesso", que gera uma senha provisória e deixa rastro;
 *  • perfil só é escolhido na criação. Depois, a troca passa pela rota
 *    dedicada, que verifica se a pessoa não é o último administrador ativo.
 *
 * Essa separação espelha a da API, e não é decoração: se o formulário de
 * edição aceitasse perfil, a tela pediria à API algo que ela recusa, e o
 * usuário veria um erro sem entender de onde veio.
 */
interface UserFormDialogProps {
  /** Ausente = cadastro novo. */
  user?: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserFormDialog({ user, open, onOpenChange }: UserFormDialogProps) {
  const isEditing = user !== undefined;

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('EMPLOYEE');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recarrega a cada abertura: sem isto, abrir o diálogo para a Maria depois de
  // tê-lo aberto para o João mostraria os dados do João por um instante.
  useEffect(() => {
    if (!open) return;

    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setRole(user?.role ?? 'EMPLOYEE');
    setPassword('');
    setShowPassword(false);
    setError(null);
  }, [open, user]);

  function handleSubmit(): void {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedName.length < 3) {
      setError('O nome precisa ter ao menos 3 caracteres.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Informe um e-mail válido.');
      return;
    }

    if (!isEditing) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    }

    setError(null);

    if (isEditing) {
      updateMutation.mutate(
        { id: user.id, payload: { name: trimmedName, email: trimmedEmail } },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }

    createMutation.mutate(
      { name: trimmedName, email: trimmedEmail, role, password, active: true },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isEditing ? 'Editar usuário' : 'Novo usuário'}</AlertDialogTitle>
          <AlertDialogDescription>
            {isEditing
              ? 'Nome e e-mail. O perfil de acesso e a situação são alterados pelos botões da listagem.'
              : 'A pessoa entra com a senha definida aqui e é obrigada a trocá-la no primeiro acesso.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="user-name">Nome *</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Maria Souza"
              disabled={isPending}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-email">E-mail *</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="maria@escritorio.com.br"
              disabled={isPending}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">É com ele que a pessoa faz login.</p>
          </div>

          {!isEditing && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="user-role">Perfil de acesso *</Label>
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as UserRole)}
                  disabled={isPending}
                >
                  <SelectTrigger id="user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {ROLE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="user-password">Senha inicial *</Label>
                <div className="relative">
                  <Input
                    id="user-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pr-10"
                    disabled={isPending}
                    autoComplete="new-password"
                  />
                  {/* Olho para revelar: a senha será DITADA a outra pessoa, e
                      digitar às cegas algo que se vai transmitir por telefone
                      é como o erro de digitação entra no sistema. */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-0.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Mínimo de 8 caracteres, com ao menos uma letra e um número. A pessoa troca no
                  primeiro acesso.
                </p>
              </div>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>

          {/* Botão comum em vez de AlertDialogAction: o Action fecha o diálogo
              ao clicar, e aqui a validação pode recusar — fechar levaria embora
              o formulário junto com a mensagem de erro. */}
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <Loader2 className="animate-spin" />
            ) : isEditing ? (
              <Save />
            ) : (
              <UserPlus />
            )}
            {isPending ? 'Salvando…' : isEditing ? 'Salvar' : 'Cadastrar usuário'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
