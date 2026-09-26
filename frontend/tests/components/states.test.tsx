import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { clientDetailFixture, dashboardFixture, paginated } from '../utils/fixtures';
import { ADMIN, renderApp } from '../utils/render';
import { fail, mockApi, ok, type RouteHandler } from '../utils/server';

/** Carregamento, erro e vazio — os três estados que toda tela precisa ter. */

const session: Record<string, RouteHandler> = {
  'GET /auth/me': ok({ user: ADMIN }),
  'GET /health': { body: { status: 'ok', database: 'connected' } },
};

describe('painel', () => {
  it('mostra esqueletos enquanto carrega e os números quando chegam', async () => {
    mockApi({ ...session, 'GET /dashboard': { ...ok(dashboardFixture()), delayMs: 150 } });
    const { container } = renderApp('/dashboard', { token: 'jwt' });

    await screen.findByText('Ana Administradora');
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);

    // 45250.00 -> "R$ 45.250,00"
    expect(await screen.findByText(/45\.250,00/)).toBeInTheDocument();
    // Os gráficos vêm num pedaço carregado sob demanda: o esqueleto deles some por último.
    await waitFor(() => expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0));
  });

  it('falha: mostra a mensagem da API e recupera com "Tentar novamente"', async () => {
    let calls = 0;
    mockApi({
      ...session,
      'GET /dashboard': () => {
        calls += 1;
        return calls === 1
          ? fail(503, 'INTERNAL_ERROR', 'Banco de dados indisponível no momento.')
          : ok(dashboardFixture());
      },
    });
    const { user } = renderApp('/dashboard', { token: 'jwt' });

    expect(await screen.findByText('Não foi possível carregar o painel')).toBeInTheDocument();
    // No alerta da página e no toast.
    expect(screen.getAllByText('Banco de dados indisponível no momento.').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /tentar novamente/i }));

    expect(await screen.findByText(/45\.250,00/)).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar o painel')).not.toBeInTheDocument();
  });

  it('API fora do ar: explica em vez de exibir tela em branco', async () => {
    const { fetchMock } = mockApi(session);
    const realImplementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/dashboard')) throw new TypeError('Failed to fetch');
      return realImplementation(input, init);
    });

    renderApp('/dashboard', { token: 'jwt' });

    expect(await screen.findByText(/Não foi possível conectar ao servidor/)).toBeInTheDocument();
  });
});

describe('listagem de clientes', () => {
  it('lista vazia mostra orientação, não uma tabela sem linhas', async () => {
    mockApi({ ...session, 'GET /clients': ok(paginated([])) });
    renderApp('/clientes', { token: 'jwt' });

    expect(await screen.findByText('Nenhum cliente cadastrado')).toBeInTheDocument();
  });

  it('erro ao listar mostra aviso', async () => {
    mockApi({ ...session, 'GET /clients': fail(500, 'INTERNAL_ERROR', 'Erro interno do servidor.') });
    renderApp('/clientes', { token: 'jwt' });

    expect(await screen.findByText('Não foi possível carregar os clientes')).toBeInTheDocument();
  });

  it('com dados, mostra os clientes com documento formatado', async () => {
    const client = clientDetailFixture();
    mockApi({ ...session, 'GET /clients': ok(paginated([client])) });
    renderApp('/clientes', { token: 'jwt' });

    const table = await screen.findByRole('table');
    await waitFor(() =>
      expect(within(table).getByText('Padaria Pão Quente Ltda')).toBeInTheDocument(),
    );
    expect(within(table).getByText('11.222.333/0001-81')).toBeInTheDocument();
  });

  it('busca envia o termo para a API', async () => {
    const { requests } = mockApi({ ...session, 'GET /clients': ok(paginated([])) });
    const { user } = renderApp('/clientes', { token: 'jwt' });

    const search = await screen.findByRole('searchbox').catch(() => screen.getByPlaceholderText(/buscar/i));
    await user.type(search, 'padaria');

    await waitFor(() =>
      expect(requests.some((request) => request.query.get('search') === 'padaria')).toBe(true),
    );
  });
});
