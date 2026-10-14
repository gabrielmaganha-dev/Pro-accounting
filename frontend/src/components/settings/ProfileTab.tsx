import { KeyRound, Loader2, Save, ShieldAlert, UserCog } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ChangePasswordDialog } from '@/components/users/ChangePasswordDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useUpdateOwnProfile } from '@/hooks/use-settings';
import { ROLE_LABELS } from '@/types/auth';

/**
 * Perfil do próprio usuário.
 *
 * A troca de senha reaproveita o `ChangePasswordDialog` construído na etapa de
 * usuários — mesma validação de força, mesma invalidação de sessão, mesma
 * emissão de token novo. Reimplementar aqui criaria duas políticas de senha no
 * mesmo sistema, e uma delas ficaria para trás na primeira mudança de regra.
 */
export function ProfileTab() {
  const { user, updateCurrentUser } = useAuth();
  const mutation = useUpdateOwnProfile(updateCurrentUser);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
    setCurrentPassword('');
    setError(null);
  }, [user]);

  const emailChanged = user !== null && email.trim().toLowerCase() !== user.email;

  function handleSubmit(): void {
    if (name.trim().length < 3) {
      setError('O nome precisa ter ao menos 3 caracteres.');
      return;
    }

    const normalized = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError('Informe um e-mail válido.');
      return;
    }

    if (emailChanged && currentPassword.length === 0) {
      setError('Para alterar o e-mail de acesso, confirme a sua senha atual.');
      return;
    }

    setError(null);

    mutation.mutate(
      {
        name: name.trim(),
        email: normalized,
        ...(emailChanged ? { currentPassword } : {}),
      },
      { onSuccess: () => setCurrentPassword('') },
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="size-4 text-muted-foreground" aria-hidden="true" />
            Meus dados
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Perfil de acesso:{' '}
            <strong>{user ? ROLE_LABELS[user.role] : '—'}</strong>. Só um administrador pode
            alterá-lo.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Nome *</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={mutation.isPending}
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-email">E-mail *</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={mutation.isPending}
                maxLength={180}
              />
              <p className="text-xs text-muted-foreground">É com ele que você entra no sistema.</p>
            </div>
          </div>

          {/* O campo de senha só aparece quando o e-mail muda: pedi-lo sempre
              treinaria o usuário a digitar a senha em qualquer formulário. */}
          {emailChanged && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-2 text-sm text-amber-900">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>
                  Você está trocando o e-mail de acesso. Confirme a senha atual — é o que impede
                  que alguém redirecione a sua conta em um computador destravado.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="profile-current-password">Senha atual *</Label>
                <Input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={mutation.isPending}
                  autoComplete="current-password"
                  className="bg-card"
                />
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {mutation.isPending ? 'Salvando…' : 'Salvar meus dados'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
            Senha
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Mínimo de 8 caracteres, com ao menos uma letra e um número. Ao trocar, as outras
            sessões abertas nesta conta são encerradas — esta continua ativa.
          </p>
        </CardHeader>

        <CardContent>
          <Button variant="outline" onClick={() => setPasswordOpen(true)}>
            <KeyRound />
            Alterar senha
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
