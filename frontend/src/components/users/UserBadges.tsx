import { ShieldCheck, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, type UserRole } from '@/types/auth';
import { USER_STATUS_LABELS, type UserStatus } from '@/types/user';

/**
 * Selos de perfil e situação do usuário.
 *
 * Os dois moram no mesmo arquivo por serem sempre exibidos lado a lado, na
 * mesma linha da tabela — separá-los renderia dois arquivos de dez linhas que
 * só se usam juntos.
 *
 * Como no resto do sistema, nenhum estado é comunicado apenas por cor: o selo
 * de perfil carrega ícone e texto, e o de situação carrega texto.
 */
export function UserRoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge variant={role === 'ADMIN' ? 'default' : 'outline'}>
      {role === 'ADMIN' ? (
        <ShieldCheck className="size-3.5" aria-hidden="true" />
      ) : (
        <User className="size-3.5" aria-hidden="true" />
      )}
      {ROLE_LABELS[role]}
    </Badge>
  );
}

const STATUS_STYLE: Record<UserStatus, { variant: 'success' | 'warning' | 'neutral'; dot: string }> =
  {
    ACTIVE: { variant: 'success', dot: 'bg-emerald-600' },
    PENDING: { variant: 'warning', dot: 'bg-amber-500' },
    BLOCKED: { variant: 'neutral', dot: 'bg-slate-400' },
  };

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const style = STATUS_STYLE[status];

  return (
    <Badge variant={style.variant}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {USER_STATUS_LABELS[status]}
    </Badge>
  );
}

/** A conta entra (também) com o Google. */
export function GoogleAccountBadge() {
  return (
    <Badge variant="outline" title="Esta conta entra com uma Conta Google.">
      Google
    </Badge>
  );
}

/**
 * Marca de senha provisória.
 *
 * Só aparece enquanto a pessoa não trocou a senha definida no cadastro ou no
 * reset. Serve ao administrador para saber quem ainda não entrou — e para
 * distinguir "resetei e a pessoa já voltou a usar" de "resetei e ninguém
 * entrou desde então", que é o caso em que vale reenviar a senha.
 */
export function TemporaryPasswordBadge() {
  return (
    <Badge variant="warning" title="A pessoa ainda não trocou a senha provisória.">
      Senha provisória
    </Badge>
  );
}
