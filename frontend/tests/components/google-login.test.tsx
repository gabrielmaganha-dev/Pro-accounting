import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { tokenStorage } from '@/utils/storage';

import { dashboardFixture } from '../utils/fixtures';
import { ADMIN, renderApp } from '../utils/render';
import { fail, mockApi, ok } from '../utils/server';

/**
 * Login com Google, do ponto de vista da interface.
 *
 * O cliente do Supabase é substituído por um simulado: o que se testa é o que
 * a INTERFACE faz — mostrar o botão, levar ao Google, concluir o retorno,
 * tratar cada desfecho —, não o OAuth do Google nem o Supabase.
 */
const supabase = vi.hoisted(() => {
  const auth = {
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    signOut: vi.fn(),
  };

  return {
    available: true,
    hasStoredState: false,
    client: { auth },
    auth,
  };
});

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => Promise.resolve(supabase.client),
  isGoogleLoginAvailable: () => Promise.resolve(supabase.available),
  hasStoredSupabaseState: () => supabase.hasStoredState,
}));

const dashboardRoutes = {
  'GET /health': { body: { status: 'ok', database: 'connected' } },
  'GET /dashboard': ok(dashboardFixture()),
};

beforeEach(() => {
  supabase.available = true;
  supabase.hasStoredState = false;
  // Nunca resolve: no navegador a página sai para o Google e não volta.
  supabase.auth.signInWithOAuth.mockReset().mockReturnValue(new Promise(() => undefined));
  supabase.auth.exchangeCodeForSession.mockReset().mockResolvedValue({
    data: { session: { access_token: 'token-do-supabase-0123456789' } },
    error: null,
  });
  supabase.auth.signOut.mockReset().mockResolvedValue({ error: null });
});

describe('tela de login', () => {
  it('mostra "Continuar com Google" e "Criar conta" sem tirar o login por senha', async () => {
    mockApi({});
    renderApp('/login');

    expect(await screen.findByRole('button', { name: /continuar com google/i })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/criar-conta',
    );
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^entrar$/i })).toBeInTheDocument();
  });

  it('sem o provedor Google ligado, a tela fica só com e-mail e senha', async () => {
    supabase.available = false;
    mockApi({});
    renderApp('/login');

    expect(await screen.findByRole('button', { name: /^entrar$/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /continuar com google/i })).toBeNull(),
    );
    expect(screen.queryByRole('link', { name: 'Criar conta' })).toBeNull();
  });

  it('o clique leva ao Google, mostra "Redirecionando…" e não aceita segundo clique', async () => {
    mockApi({});
    const { user } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));

    const busy = await screen.findByRole('button', { name: /redirecionando para o google/i });
    expect(busy).toBeDisabled();
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });

    await user.click(busy);
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  });

  it('se não for possível abrir o Google, avisa e libera o botão de novo', async () => {
    supabase.auth.signInWithOAuth.mockReset().mockRejectedValue(new TypeError('Failed to fetch'));
    mockApi({});
    const { user } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: /continuar com google/i }));

    expect(await screen.findByText(/Não foi possível abrir o login do Google/)).toBeVisible();
    expect(screen.getByRole('button', { name: /continuar com google/i })).toBeEnabled();
  });
});

describe('retorno do Google (/auth/callback)', () => {
  it('sucesso: troca o código, entrega o token à API, encerra o Supabase e abre o painel', async () => {
    const { requests } = mockApi({
      'POST /auth/google': ok({ token: 'jwt-do-sistema', expiresIn: '1d', user: ADMIN }),
      ...dashboardRoutes,
    });
    renderApp('/auth/callback?code=codigo-do-google');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));

    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('codigo-do-google');
    expect(requests.find((r) => r.path === '/auth/google')?.body).toEqual({
      accessToken: 'token-do-supabase-0123456789',
    });
    // A sessão é a do sistema; a do Supabase é encerrada.
    expect(tokenStorage.get()).toBe('jwt-do-sistema');
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('pessoa cancelou no Google: volta ao login com aviso, sem erro', async () => {
    const { requests } = mockApi({});
    renderApp('/auth/callback?error=access_denied&error_description=cancelled');

    expect(await screen.findByText(/Login com Google cancelado/)).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(requests).toHaveLength(0);
    expect(tokenStorage.get()).toBeNull();
  });

  it('endereço de retorno sem código: aviso de link inválido', async () => {
    mockApi({});
    renderApp('/auth/callback');

    expect(await screen.findByText(/inválido ou expirado/)).toBeVisible();
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('código vencido ou de outro navegador: o Supabase recusa e a API nem é chamada', async () => {
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: new Error('invalid flow state'),
    });
    const { requests } = mockApi({});
    renderApp('/auth/callback?code=codigo-velho');

    expect(await screen.findByText(/expirou ou não pôde ser confirmado/)).toBeVisible();
    expect(requests.find((r) => r.path === '/auth/google')).toBeUndefined();
    expect(tokenStorage.get()).toBeNull();
  });

  it('primeiro acesso: conta criada e aguardando aprovação', async () => {
    mockApi({
      'POST /auth/google': fail(
        403,
        'ACCOUNT_PENDING',
        'Cadastro recebido! Seu acesso está aguardando aprovação do administrador.',
      ),
    });
    renderApp('/auth/callback?code=codigo-do-google');

    expect(
      await screen.findByText(
        'Cadastro recebido! Seu acesso está aguardando aprovação do administrador.',
      ),
    ).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(tokenStorage.get()).toBeNull();
    // Mesmo sem entrar, a sessão do Supabase não fica para trás.
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('conta bloqueada: mensagem de bloqueio', async () => {
    mockApi({
      'POST /auth/google': fail(
        403,
        'ACCOUNT_BLOCKED',
        'Sua conta está bloqueada. Entre em contato com o administrador.',
      ),
    });
    renderApp('/auth/callback?code=codigo-do-google');

    expect(
      await screen.findByText('Sua conta está bloqueada. Entre em contato com o administrador.'),
    ).toBeVisible();
    expect(tokenStorage.get()).toBeNull();
  });

  it('API fora do ar no retorno: avisa sem travar', async () => {
    const { fetchMock } = mockApi({});
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderApp('/auth/callback?code=codigo-do-google');

    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });
});

describe('criar conta', () => {
  it('oferece o cadastro pelo Google e explica a aprovação', async () => {
    mockApi({});
    renderApp('/criar-conta');

    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeVisible();
    expect(screen.getByText(/um administrador do escritório libera o seu acesso/)).toBeVisible();
    expect(await screen.findByRole('button', { name: /continuar com google/i })).toBeVisible();
  });
});

describe('sessão', () => {
  it('F5 com o servidor fora do ar NÃO desloga: oferece tentar de novo', async () => {
    let calls = 0;
    mockApi({
      'GET /auth/me': () => {
        calls += 1;
        return calls === 1
          ? fail(503, 'SERVICE_UNAVAILABLE', 'Serviço temporariamente indisponível.')
          : ok({ user: ADMIN });
      },
      ...dashboardRoutes,
    });
    const { user } = renderApp('/dashboard', { token: 'jwt-guardado' });

    expect(await screen.findByText('Não foi possível verificar sua sessão')).toBeVisible();
    expect(tokenStorage.get()).toBe('jwt-guardado');
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');

    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));

    expect(await screen.findByText('Ana Administradora')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard');
  });

  it('"Sair" encerra a sessão do sistema e qualquer resto da do Supabase', async () => {
    supabase.hasStoredState = true;
    mockApi({
      'GET /auth/me': ok({ user: ADMIN }),
      'POST /auth/logout': { status: 204 },
      ...dashboardRoutes,
    });
    const { user } = renderApp('/dashboard', { token: 'jwt' });

    await user.click(await screen.findByRole('button', { name: /Ana Administradora/ }));
    await user.click(await screen.findByRole('menuitem', { name: /sair/i }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
    expect(tokenStorage.get()).toBeNull();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('aprovação de cadastros', () => {
  const pendingUser = {
    id: 'u-novo',
    name: 'João do Google',
    email: 'joao@gmail.com',
    role: 'EMPLOYEE',
    status: 'PENDING',
    mustChangePassword: false,
    avatarUrl: null,
    googleLinked: true,
    createdAt: '2026-10-16T12:00:00.000Z',
    updatedAt: '2026-10-16T12:00:00.000Z',
  };

  it('o administrador vê quem aguarda aprovação e aprova', async () => {
    const page = (items: unknown[]) => ok({ items, page: 1, pageSize: 20, total: items.length, totalPages: 1 });
    const { requests } = mockApi({
      'GET /auth/me': ok({ user: ADMIN }),
      'GET /users': (request) =>
        request.query.get('status') === 'PENDING' ? page([pendingUser]) : page([pendingUser]),
      'PATCH /users/:id/status': ok({ ...pendingUser, status: 'ACTIVE' }),
    });
    const { user } = renderApp('/usuarios', { token: 'jwt' });

    expect(await screen.findByText('1 cadastro aguardando a sua aprovação.')).toBeVisible();

    const table = await screen.findByRole('table');
    const row = (await within(table).findAllByText('João do Google'))[0]?.closest('tr');
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getAllByText('Aguardando aprovação').length).toBeGreaterThan(0);
    expect(within(row as HTMLElement).getByText('Google')).toBeInTheDocument();

    await user.click(within(row as HTMLElement).getByRole('button', { name: /Ações para João/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Aprovar acesso' }));

    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ status: 'ACTIVE' }),
    );
    expect(await screen.findByText('Acesso de "João do Google" liberado.')).toBeVisible();
  });
});
