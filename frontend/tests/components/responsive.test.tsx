import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { clientDetailFixture, dashboardFixture, paginated } from '../utils/fixtures';
import { ADMIN, renderApp } from '../utils/render';
import { mockApi, ok, type RouteHandler } from '../utils/server';

/**
 * Responsividade.
 *
 * O jsdom não calcula layout, então o que se verifica aqui é o CONTRATO
 * responsivo: quais elementos existem em cada faixa (pelas classes de
 * breakpoint do Tailwind) e o comportamento da gaveta de navegação, que é a
 * única parte com lógica — abrir, navegar e fechar sozinha.
 */

const routes: Record<string, RouteHandler> = {
  'GET /auth/me': ok({ user: ADMIN }),
  'GET /health': { body: { status: 'ok', database: 'connected' } },
  'GET /dashboard': ok(dashboardFixture()),
  'GET /clients': ok(paginated([clientDetailFixture()])),
};

describe('layout responsivo', () => {
  it('menu fixo só a partir de lg; botão de menu só abaixo de lg', async () => {
    mockApi(routes);
    const { container } = renderApp('/dashboard', { token: 'jwt' });

    const menuButton = await screen.findByRole('button', { name: 'Abrir menu de navegação' });
    expect(menuButton).toHaveClass('lg:hidden');

    const sidebar = container.querySelector('aside');
    expect(sidebar).toHaveClass('hidden', 'lg:block');

    // O conteúdo só abre espaço para o menu quando ele está fixo.
    expect(container.querySelector('main')?.parentElement).toHaveClass('lg:pl-64');
  });

  it('no celular, a gaveta abre, navega e fecha sozinha', async () => {
    mockApi(routes);
    const { user } = renderApp('/dashboard', { token: 'jwt' });

    await user.click(await screen.findByRole('button', { name: 'Abrir menu de navegação' }));

    const drawer = await screen.findByRole('dialog', { name: 'Menu de navegação' });
    await user.click(within(drawer).getByRole('link', { name: 'Clientes' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/clientes'));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Menu de navegação' })).not.toBeInTheDocument(),
    );
  });

  it('a gaveta respeita o perfil, igual ao menu fixo', async () => {
    mockApi({ ...routes, 'GET /auth/me': ok({ user: { ...ADMIN, role: 'EMPLOYEE' } }) });
    const { user } = renderApp('/dashboard', { token: 'jwt' });

    await user.click(await screen.findByRole('button', { name: 'Abrir menu de navegação' }));
    const drawer = await screen.findByRole('dialog', { name: 'Menu de navegação' });

    expect(within(drawer).queryByRole('link', { name: 'Financeiro' })).not.toBeInTheDocument();
  });

  it('tabelas rolam na horizontal em vez de estourar a tela', async () => {
    mockApi(routes);
    renderApp('/clientes', { token: 'jwt' });

    const table = await screen.findByRole('table');
    expect(table.parentElement).toHaveClass('overflow-x-auto');
  });

  it('no celular o topo esconde o nome do usuário e mantém o avatar', async () => {
    mockApi(routes);
    renderApp('/dashboard', { token: 'jwt' });

    const name = await screen.findByText('Ana Administradora');
    expect(name.closest('span.hidden')).toHaveClass('sm:block');
    expect(screen.getByText('AA')).toBeInTheDocument();
  });

  it('login ocupa a largura do celular com teto no desktop', async () => {
    mockApi({});
    renderApp('/login');

    const heading = await screen.findByRole('heading', { name: 'Entrar no sistema' });
    expect(heading.closest('div.w-full')).toHaveClass('max-w-sm');
  });
});
