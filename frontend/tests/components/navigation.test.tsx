import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { tokenStorage } from '@/utils/storage';

import { dashboardFixture, paginated } from '../utils/fixtures';
import { ADMIN, EMPLOYEE, renderApp } from '../utils/render';
import { fail, mockApi, ok, type RouteHandler } from '../utils/server';

/** Rotas que qualquer tela autenticada consulta. */
function sessionRoutes(user = ADMIN): Record<string, RouteHandler> {
  return {
    'GET /auth/me': ok({ user }),
    'GET /health': { body: { status: 'ok', database: 'connected' } },
    'GET /dashboard': ok(dashboardFixture()),
    'GET /clients': ok(paginated([])),
  };
}

function location() {
  return screen.getByTestId('location');
}

function mainNav() {
  // O menu aparece duas vezes na árvore (fixo e gaveta); o fixo está sempre montado.
  return screen.getAllByRole('navigation', { name: 'Navegação principal' })[0]!;
}

describe('sessão e guards de rota', () => {
  it('sem sessão, qualquer rota protegida leva ao login', async () => {
    mockApi({});
    renderApp('/faturas');

    await waitFor(() => expect(location()).toHaveTextContent('/login'));
  });

  it('a raiz redireciona para o painel', async () => {
    mockApi(sessionRoutes());
    renderApp('/', { token: 'jwt' });

    await waitFor(() => expect(location()).toHaveTextContent('/dashboard'));
  });

  it('restaura a sessão pelo token salvo, mostrando "Verificando sua sessão…" antes', async () => {
    mockApi({ ...sessionRoutes(), 'GET /auth/me': { ...ok({ user: ADMIN }), delayMs: 100 } });
    renderApp('/dashboard', { token: 'jwt' });

    expect(screen.getByText('Verificando sua sessão…')).toBeInTheDocument();
    expect(await screen.findByText('Ana Administradora')).toBeInTheDocument();
    expect(location()).toHaveTextContent('/dashboard');
  });

  it('token inválido: descarta e vai para o login', async () => {
    mockApi({ 'GET /auth/me': fail(401, 'UNAUTHORIZED', 'Sessão expirada.') });
    renderApp('/dashboard', { token: 'jwt-expirado' });

    await waitFor(() => expect(location()).toHaveTextContent('/login'));
    expect(tokenStorage.get()).toBeNull();
  });

  it('logado, a tela de login redireciona para o painel', async () => {
    mockApi(sessionRoutes());
    renderApp('/login', { token: 'jwt' });

    await waitFor(() => expect(location()).toHaveTextContent('/dashboard'));
  });

  it('401 no meio do uso encerra a sessão e volta ao login', async () => {
    mockApi({
      ...sessionRoutes(),
      'GET /clients': fail(401, 'UNAUTHORIZED', 'Sessão expirada.'),
    });
    renderApp('/clientes', { token: 'jwt' });

    await waitFor(() => expect(location()).toHaveTextContent('/login'));
    expect(tokenStorage.get()).toBeNull();
  });

  it('rota inexistente mostra a página 404', async () => {
    mockApi(sessionRoutes());
    renderApp('/rota-que-nao-existe', { token: 'jwt' });

    expect(await screen.findByText('Página não encontrada')).toBeInTheDocument();
  });
});

describe('navegação por perfil', () => {
  it('administrador vê Financeiro e Usuários no menu', async () => {
    mockApi(sessionRoutes(ADMIN));
    renderApp('/dashboard', { token: 'jwt' });

    await screen.findByText('Ana Administradora');
    const nav = within(mainNav());

    for (const label of ['Dashboard', 'Clientes', 'Contratos', 'Faturas', 'Pagamentos', 'Financeiro', 'Usuários']) {
      expect(nav.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('funcionário NÃO vê Financeiro nem Usuários', async () => {
    mockApi(sessionRoutes(EMPLOYEE));
    renderApp('/dashboard', { token: 'jwt' });

    await screen.findByText('Fábio Funcionário');
    const nav = within(mainNav());

    expect(nav.getByRole('link', { name: 'Clientes' })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Financeiro' })).not.toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument();
  });

  it('funcionário que digita /financeiro na barra é devolvido ao painel', async () => {
    const { requests } = mockApi(sessionRoutes(EMPLOYEE));
    renderApp('/financeiro', { token: 'jwt' });

    await waitFor(() => expect(location()).toHaveTextContent('/dashboard'));
    // Nem chega a consultar a API do financeiro.
    expect(requests.some((request) => request.path.startsWith('/finance'))).toBe(false);
  });

  it('funcionário que digita /usuarios é devolvido ao painel', async () => {
    mockApi(sessionRoutes(EMPLOYEE));
    renderApp('/usuarios', { token: 'jwt' });

    await waitFor(() => expect(location()).toHaveTextContent('/dashboard'));
  });

  it('clicar no menu navega e marca o título da página', async () => {
    mockApi(sessionRoutes());
    const { user } = renderApp('/dashboard', { token: 'jwt' });

    await screen.findByText('Ana Administradora');
    await user.click(within(mainNav()).getByRole('link', { name: 'Clientes' }));

    await waitFor(() => expect(location()).toHaveTextContent('/clientes'));
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
  });

  it('"Sair" limpa a sessão e volta ao login', async () => {
    mockApi(sessionRoutes());
    const { user } = renderApp('/dashboard', { token: 'jwt' });

    await user.click(await screen.findByRole('button', { name: /Ana Administradora/ }));
    await user.click(await screen.findByRole('menuitem', { name: /sair/i }));

    await waitFor(() => expect(location()).toHaveTextContent('/login'));
    expect(tokenStorage.get()).toBeNull();
  });
});
