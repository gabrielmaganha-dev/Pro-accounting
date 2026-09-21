import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/auth-context';
import { queryClient } from '@/lib/query-client';
import { AppRoutes } from '@/routes';

/**
 * Ordem dos provedores (de fora para dentro):
 *
 *   QueryClientProvider  — o AuthProvider usa useQueryClient para limpar o
 *                          cache no logout, então precisa estar por fora.
 *   BrowserRouter        — os guards de rota usam useLocation/Navigate.
 *   AuthProvider         — fornece o usuário aos guards e às telas.
 *
 * Inverter qualquer par acima gera erro de "hook fora do provider".
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
