import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados de gestão não mudam a cada segundo; 30s evita uma enxurrada de
      // requisições ao navegar entre telas.
      staleTime: 30_000,

      // Repetir um 404 ou um 403 é desperdício — a resposta não vai mudar.
      // Só vale repetir falha de rede ou erro de servidor.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 2;
      },

      // Evita recarregar tudo sempre que o usuário volta de outra aba.
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Reenviar um POST automaticamente poderia duplicar um registro.
      retry: false,
    },
  },
});
