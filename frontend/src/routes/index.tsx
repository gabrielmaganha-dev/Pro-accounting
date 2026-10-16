import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/layouts/AppLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { AuthCallbackPage } from '@/pages/AuthCallbackPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
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
import { SignUpPage } from '@/pages/SignUpPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute';

/**
 * Telas carregadas sob demanda.
 *
 * Financeiro traz a biblioteca de gráficos (cerca de 400 kB); as outras quatro
 * são telas de administração que a maioria das sessões nem abre. Importadas de
 * forma estática, todas iam no pacote inicial — o que a tela de LOGIN baixava
 * antes de a pessoa conseguir digitar a senha.
 *
 * As telas do dia a dia (clientes, contratos, faturas, pagamentos) continuam
 * no pacote principal: são para onde quase toda sessão vai, e carregá-las sob
 * demanda só trocaria um download por uma espera a cada clique.
 *
 * O `.then` adapta a exportação nomeada ao formato que `lazy` espera.
 */
const FinancePage = lazy(() =>
  import('@/pages/FinancePage').then((module) => ({ default: module.FinancePage })),
);
const ReportsPage = lazy(() =>
  import('@/pages/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })),
);
const AuditPage = lazy(() =>
  import('@/pages/audit/AuditPage').then((module) => ({ default: module.AuditPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const UsersListPage = lazy(() =>
  import('@/pages/users/UsersListPage').then((module) => ({ default: module.UsersListPage })),
);

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
          <Route path="/criar-conta" element={<SignUpPage />} />
        </Route>
      </Route>

      {/* Retorno do login com Google. Fora dos dois guards: ela mesma decide
          para onde ir — painel ou login com o motivo. */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

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

          {/* Relatórios — aberto a todos os perfis, e SEM guard de perfil de
              propósito: o funcionário usa os relatórios de clientes, contratos
              e faturas. Os financeiros são omitidos do catálogo para ele e
              recusados pela API se pedidos pelo id. */}
          <Route path="/relatorios" element={<ReportsPage />} />

          {/* Configurações — aberta a todos os perfis. As abas de empresa,
              identidade visual e preferências ficam em modo leitura para o
              funcionário; as rotas de escrita exigem ADMIN na API. */}
          <Route path="/configuracoes" element={<SettingsPage />} />

          {/* Guard adicional: só administradores. O menu já esconde o item,
              mas alguém que digite a URL direto também precisa ser barrado —
              e mesmo passando daqui, as rotas /api/users/* exigem o perfil. */}
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/usuarios" element={<UsersListPage />} />

            {/* Auditoria — mostra o que TODOS fizeram, com IP e navegador. É
                supervisão, não rotina, e a API recusa a leitura para quem não
                for administrador. */}
            <Route path="/auditoria" element={<AuditPage />} />
          </Route>
        </Route>
      </Route>

      {/* --- Redirecionamentos e 404 ---------------------------------- */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
