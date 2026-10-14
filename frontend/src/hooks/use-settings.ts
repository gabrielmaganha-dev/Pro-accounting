import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/use-auth';
import { ApiError } from '@/services/api';
import {
  getSettings,
  updateAppearance,
  updateCompany,
  updateGeneral,
  updateOwnProfile,
} from '@/services/settings.service';
import type { AuthUser } from '@/types/auth';
import type {
  AppearancePayload,
  CompanyPayload,
  GeneralPayload,
  ProfilePayload,
} from '@/types/settings';

export const settingsKeys = {
  all: ['settings'] as const,
  detail: () => [...settingsKeys.all, 'detail'] as const,
};

/**
 * Configuração do sistema.
 *
 * `staleTime` alto: é uma linha que muda raramente e que a aplicação inteira
 * consome para se desenhar. Revalidar a cada foco de janela seria uma
 * requisição por nada; as mutações abaixo invalidam explicitamente.
 *
 * `enabled` preso à autenticação porque a rota exige token: sem isso, o
 * `<Logo />` da tela de LOGIN dispararia uma requisição que só pode terminar em
 * 401 — e o tratamento global de 401 limparia a sessão a cada visita ao login.
 * Deslogado, a marca cai no padrão de fábrica, que é o certo.
 */
export function useSettings() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: settingsKeys.detail(),
    queryFn: ({ signal }) => getSettings(signal),
    enabled: isAuthenticated,
    staleTime: 10 * 60 * 1000,
  });
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CompanyPayload) => updateCompany(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      toast.success('Dados da empresa salvos.');
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível salvar os dados da empresa.'));
    },
  });
}

export function useUpdateAppearance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AppearancePayload) => updateAppearance(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      toast.success('Identidade visual salva.');
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível salvar a identidade visual.'));
    },
  });
}

export function useUpdateGeneral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GeneralPayload) => updateGeneral(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      // O painel e o sino usam a antecedência de vencimento; sem isto os
      // alertas continuariam com a janela antiga até alguém recarregar.
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Preferências salvas.');
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível salvar as preferências.'));
    },
  });
}

/**
 * Edição do próprio cadastro.
 *
 * Quem chama passa a função que atualiza o usuário da sessão: o nome aparece na
 * barra do topo, e sem isso continuaria o antigo até a pessoa sair e entrar.
 */
export function useUpdateOwnProfile(onUpdated: (user: AuthUser) => void) {
  return useMutation({
    mutationFn: (payload: ProfilePayload) => updateOwnProfile(payload),
    onSuccess: (user) => {
      onUpdated(user);
      toast.success('Perfil atualizado.');
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'Não foi possível salvar o perfil.'));
    },
  });
}
