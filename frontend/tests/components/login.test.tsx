import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { tokenStorage } from '@/utils/storage';

import { dashboardFixture } from '../utils/fixtures';
import { ADMIN } from '../utils/render';
import { renderApp } from '../utils/render';
import { fail, mockApi, ok } from '../utils/server';

const loggedInRoutes = {
  'GET /health': { body: { status: 'ok', database: 'connected' } },
  'GET /dashboard': ok(dashboardFixture()),
};

describe('tela de login', () => {
  it('valida os campos antes de chamar a API', async () => {
    const { requests } = mockApi({});
    const { user } = renderApp('/login');

    await user.click(await screen.findByRole('button', { name: /entrar/i }));

    expect(await screen.findByText('Informe seu e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('E-mail'), 'nao-e-email');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('entra, guarda o token e vai para o painel', async () => {
    const { requests } = mockApi({
      'POST /auth/login': ok({ token: 'jwt-novo', expiresIn: '1d', user: ADMIN }),
      ...loggedInRoutes,
    });
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('E-mail'), 'ana@escritorio.com.br');
    await user.type(screen.getByLabelText('Senha'), 'Senha@123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(tokenStorage.get()).toBe('jwt-novo');
    expect(requests.find((r) => r.path === '/auth/login')?.body).toEqual({
      email: 'ana@escritorio.com.br',
      password: 'Senha@123',
    });
  });

  it('mostra "Entrando…" e bloqueia o formulário enquanto espera a API', async () => {
    mockApi({
      'POST /auth/login': {
        ...ok({ token: 't', expiresIn: '1d', user: ADMIN }),
        delayMs: 150,
      },
      ...loggedInRoutes,
    });
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('E-mail'), 'ana@escritorio.com.br');
    await user.type(screen.getByLabelText('Senha'), 'Senha@123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    const button = await screen.findByRole('button', { name: /entrando/i });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('E-mail')).toBeDisabled();

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
  });

  it('credenciais erradas: mostra a mensagem da API e limpa a senha', async () => {
    mockApi({
      'POST /auth/login': fail(401, 'UNAUTHORIZED', 'E-mail ou senha incorretos.'),
    });
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('E-mail'), 'ana@escritorio.com.br');
    await user.type(screen.getByLabelText('Senha'), 'errada');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveValue('');
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(tokenStorage.get()).toBeNull();
  });

  it('API fora do ar: avisa sem travar a tela', async () => {
    const { fetchMock } = mockApi({});
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { user } = renderApp('/login');

    await user.type(await screen.findByLabelText('E-mail'), 'ana@escritorio.com.br');
    await user.type(screen.getByLabelText('Senha'), 'Senha@123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeEnabled();
  });

  it('mostra e oculta a senha', async () => {
    mockApi({});
    const { user } = renderApp('/login');

    const password = await screen.findByLabelText('Senha');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('volta para a página que o usuário tentou abrir antes de logar', async () => {
    mockApi({
      'POST /auth/login': ok({ token: 't', expiresIn: '1d', user: ADMIN }),
      ...loggedInRoutes,
      'GET /clients': ok({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 }),
    });
    const { user } = renderApp('/clientes');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));

    await user.type(await screen.findByLabelText('E-mail'), 'ana@escritorio.com.br');
    await user.type(screen.getByLabelText('Senha'), 'Senha@123');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/clientes'));
  });
});
