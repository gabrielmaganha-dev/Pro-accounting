import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/services/api';
import {
  changeOwnPassword,
  createUser,
  deleteUser,
  getUser,
  listUsers,
  resetUserPassword,
  updateUser,
  updateUserRole,
  updateUserStatus,
} from '@/services/user.service';
import type { LoginResponse } from '@/types/auth';
import type {
  ChangePasswordPayload,
  CreateUserPayload,
  UpdateUserPayload,
  UserListFilters,
  UserRole,
} from '@/types/user';

/** Fábrica de chaves de cache — ver a nota em use-clients.ts. */
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: UserListFilters) => [...userKeys.lists(), filters] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

export function useUsers(filters: UserListFilters) {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: ({ signal }) => listUsers(filters, signal),
    placeholderData: (previous) => previous,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: userKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getUser(id as string, signal),
    enabled: Boolean(id),
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.lists() });
      toast.success(`Usuário "${user.name}" cadastrado.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível cadastrar o usuário.'));
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
      updateUser(id, payload),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(`Usuário "${user.name}" atualizado.`);
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível salvar as alterações.'));
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => updateUserRole(id, role),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(
        user.role === 'ADMIN'
          ? `"${user.name}" agora é administrador.`
          : `"${user.name}" agora é funcionário.`,
      );
    },
    onError: (error) => {
      // A recusa mais comum aqui é 409 "único administrador ativo", e a
      // mensagem da API já explica o que fazer antes de tentar de novo.
      toast.error(errorMessage(error, 'Não foi possível alterar o perfil.'));
    },
  });
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'BLOCKED' }) =>
      updateUserStatus(id, status),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(
        user.status === 'ACTIVE'
          ? `Acesso de "${user.name}" liberado.`
          : `"${user.name}" bloqueado. O acesso foi encerrado.`,
      );
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível alterar a situação.'));
    },
  });
}

/**
 * Reset de acesso.
 *
 * Sem toast de sucesso aqui de propósito: a senha provisória precisa ser
 * ANOTADA, e um aviso que some sozinho em cinco segundos é o lugar errado para
 * ela. Quem chama exibe o resultado num diálogo que só fecha por ação do
 * administrador.
 */
export function useResetUserPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => resetUserPassword(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível resetar o acesso.'));
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success('Usuário excluído.');
    },
    onError: (error) => {
      // 409 aqui significa "tem histórico vinculado"; a mensagem da API já
      // sugere inativar em vez de excluir.
      toast.error(errorMessage(error, 'Não foi possível excluir o usuário.'));
    },
  });
}

/**
 * Troca da própria senha.
 *
 * O `onSuccess` precisa trocar o token guardado — quem chama passa a função do
 * contexto de autenticação. Sem isso a próxima requisição usaria o token
 * antigo, já invalidado pela própria troca, e a pessoa cairia no login logo
 * depois de acertar a senha nova.
 */
export function useChangeOwnPassword(onSessionRenewed: (result: LoginResponse) => void) {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => changeOwnPassword(payload),
    onSuccess: (session) => {
      onSessionRenewed(session);
      toast.success('Senha alterada. As outras sessões desta conta foram encerradas.');
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível alterar a senha.'));
    },
  });
}
