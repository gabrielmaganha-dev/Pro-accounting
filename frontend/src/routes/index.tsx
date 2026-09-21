import { Settings, ShieldCheck } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { FinancePage } from '@/pages/FinancePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { ClientDetailPage } from '@/pages/clients/ClientDetailPage';
import { ClientFormPage } from '@/pages/clients/ClientFormPage';
import { ClientsListPage } from '@/pages/clients/ClientsListPage';
import { ContractDetailPage } from '@/pages/contracts/ContractDetailPage';
import { ContractFormPage } from '@/pages/contracts/ContractFormPage';
import { ContractsListPage } from '@/pages/contracts/ContractsListPage';
import { InvoiceDetailPage } from '@/pages/invoices/InvoiceDetailPage';
import { InvoiceFormPage } from '@/pages/invoices/InvoiceFormPage';
import { InvoicesListPage } from '@/pages/invoices/InvoicesListPage';
import { PaymentsListPage } from '@/pages/payments/PaymentsListPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute';

/**
 * Mapa de rotas.
 *
 * Três camadas aninhadas:
 *   1. guard (ProtectedRoute / PublicOnlyRoute) — quem pode entrar;
 *   2. layout (AppLayout / AuthLayout) — a moldura da tela;
 *   3. página.
 *
 * Rotas em português por serem visíveis ao usuário na barra de endereço.
 */
export function AppRoutes() {
  return (
    <Routes>
      {/* --- Públicas ------------------------------------------------- */}
      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>
      </Route>

      {/* --- Autenticadas --------------------------------------------- */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Clientes — ordem importa: "/clientes/novo" precisa vir antes de
              "/clientes/:id", senão "novo" seria interpretado como um id. */}
          <Route path="/clientes" element={<ClientsListPage />} />
          <Route path="/clientes/novo" element={<ClientFormPage />} />
          <Route path="/clientes/:id" element={<ClientDetailPage />} />
          <Route path="/clientes/:id/editar" element={<ClientFormPage />} />

          {/* Contratos — mesma ordem dos clientes: "/contratos/novo" precisa
              vir antes de "/contratos/:id", senão "novo" seria interpretado
              como um id. */}
          <Route path="/contratos" element={<ContractsListPage />} />
          <Route path="/contratos/novo" element={<ContractFormPage />} />
          <Route path="/contratos/:id" element={<ContractDetailPage />} />
          <Route path="/contratos/:id/editar" element={<ContractFormPage />} />

          {/* Faturas — mesma ordem dos demais: "/faturas/nova" precisa vir
              antes de "/faturas/:id", senão "nova" seria interpretado como um
              id. */}
          <Route path="/faturas" element={<InvoicesListPage />} />
          <Route path="/faturas/nova" element={<InvoiceFormPage />} />
          <Route path="/faturas/:id" element={<InvoiceDetailPage />} />
          <Route path="/faturas/:id/editar" element={<InvoiceFormPage />} />

          {/* Pagamentos — só leitura: um pagamento nasce vinculado a uma
              fatura e é desfeito por estorno na própria fatura. */}
          <Route path="/pagamentos" element={<PaymentsListPage />} />

          {/* Financeiro — consolidado do escritório, só administradores. O
              guard aqui é conveniência; quem protege de fato é
              authorize('ADMIN') nas rotas /api/finance/*. */}
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/financeiro" element={<FinancePage />} />
          </Route>

          <Route
            path="/configuracoes"
            element={
              <PlaceholderPage
                title="Configurações"
                description="Preferências do sistema e dados do seu perfil."
                icon={Settings}
                stage="próxima etapa"
              />
            }
          />

          {/* Guard adicional: só administradores. O menu já esconde o item,
              mas alguém que digite a URL direto também precisa ser barrado. */}
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route
              path="/usuarios"
              element={
                <PlaceholderPage
                  title="Usuários"
                  description="Gerenciamento de usuários e perfis de acesso."
                  icon={ShieldCheck}
                  stage="próxima etapa"
                />
              }
            />
          </Route>
        </Route>
      </Route>

      {/* --- Redirecionamentos e 404 ---------------------------------- */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
