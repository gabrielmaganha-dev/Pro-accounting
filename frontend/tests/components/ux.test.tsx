import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { clientDetailFixture, dashboardFixture, paginated } from '../utils/fixtures';
import { ADMIN, renderApp } from '../utils/render';
import { fail, mockApi, ok, type RouteHandler } from '../utils/server';

/** Padrões de UX compartilhados por todos os módulos. */

const session: Record<string, RouteHandler> = {
  'GET /auth/me': ok({ user: ADMIN }),
  'GET /health': { body: { status: 'ok', database: 'connected' } },
};

describe('erro x não encontrado nas fichas', () => {
  it('404 diz que o registro não existe', async () => {
    mockApi({
      ...session,
      'GET /clients/:id': fail(404, 'NOT_FOUND', 'Cliente não encontrado.'),
    });
    renderApp('/clientes/c-9', { token: 'jwt' });

    expect(await screen.findByText('Cliente não encontrado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument();
  });

  it('falha do servidor NÃO é "não encontrado": explica e permite tentar de novo', async () => {
    let calls = 0;
    mockApi({
      ...session,
      'GET /clients/:id': () => {
        calls += 1;
        return calls === 1
          ? fail(503, 'INTERNAL_ERROR', 'Banco de dados indisponível no momento.')
          : ok(clientDetailFixture());
      },
    });
    const { user } = renderApp('/clientes/c-1', { token: 'jwt' });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Não foi possível carregar o cliente')).toBeInTheDocument();
    expect(within(alert).getByText('Banco de dados indisponível no momento.')).toBeInTheDocument();
    expect(screen.queryByText('Cliente não encontrado')).not.toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: /tentar novamente/i }));

    expect(
      await screen.findByRole('heading', { name: 'Padaria Pão Quente Ltda' }),
    ).toBeInTheDocument();
  });

  it('falha numa aba não aparece como "nenhum registro"', async () => {
    mockApi({
      ...session,
      'GET /clients/:id': ok(clientDetailFixture()),
      'GET /clients/c-1/invoices': fail(500, 'INTERNAL_ERROR', 'Erro interno do servidor.'),
    });
    const { user } = renderApp('/clientes/c-1', { token: 'jwt' });

    await user.click(await screen.findByRole('tab', { name: /faturas/i }));

    expect(await screen.findByText('Não foi possível carregar as faturas')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma fatura')).not.toBeInTheDocument();
  });
});

describe('listagens', () => {
  it('lista com erro oferece "Tentar novamente"', async () => {
    let calls = 0;
    mockApi({
      ...session,
      'GET /clients': () => {
        calls += 1;
        return calls === 1 ? fail(500, 'INTERNAL_ERROR', 'Erro interno do servidor.') : ok(paginated([clientDetailFixture()]));
      },
    });
    const { user } = renderApp('/clientes', { token: 'jwt' });

    await user.click(await screen.findByRole('button', { name: /tentar novamente/i }));

    expect((await screen.findAllByText('Padaria Pão Quente Ltda')).length).toBeGreaterThan(0);
  });

  it('cabeçalho ordenável informa a ordenação ao leitor de tela', async () => {
    mockApi({ ...session, 'GET /clients': ok(paginated([clientDetailFixture()])) });
    const { user } = renderApp('/clientes', { token: 'jwt' });

    const header = await screen.findByRole('columnheader', { name: /cadastro/i });
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /cliente/i })).toHaveAttribute('aria-sort', 'none');

    await user.click(within(screen.getByRole('columnheader', { name: /cliente/i })).getByRole('button'));

    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: /cliente/i })).toHaveAttribute(
        'aria-sort',
        'ascending',
      ),
    );
  });

  it('no celular cada registro é um cartão tocável com situação visível', async () => {
    mockApi({ ...session, 'GET /clients': ok(paginated([clientDetailFixture()])) });
    renderApp('/clientes', { token: 'jwt' });

    const cards = await screen.findByRole('list', { name: 'Clientes' });
    expect(cards).toHaveClass('md:hidden');

    const link = within(cards).getByRole('link', { name: /Padaria Pão Quente Ltda/ });
    expect(link).toHaveAttribute('href', '/clientes/c-1');
    expect(within(link).getByText('Ativo')).toBeInTheDocument();

    // A tabela é a versão das telas largas.
    expect(screen.getByRole('table').closest('div.hidden')).toHaveClass('md:block');
  });
});

describe('painel', () => {
  it('itens dos alertas levam à ficha; o excedente leva à listagem filtrada', async () => {
    const overdue = {
      count: 7,
      amount: '1000.00',
      items: [
        {
          id: 'inv-9',
          number: 'FAT-9',
          clientId: 'c-1',
          clientName: 'Padaria Pão Quente Ltda',
          amount: '100.00',
          dueDate: '2026-09-01',
          daysOverdue: 24,
        },
      ],
    };
    const base = dashboardFixture();
    mockApi({
      ...session,
      'GET /dashboard': ok({ ...base, alerts: { ...base.alerts, overdueInvoices: overdue } }),
    });
    renderApp('/dashboard', { token: 'jwt' });

    const item = await screen.findByRole('link', { name: /FAT-9/ });
    expect(item).toHaveAttribute('href', '/faturas/inv-9');
    expect(screen.getByRole('link', { name: /ver todas \(6/i })).toHaveAttribute(
      'href',
      '/faturas?status=OVERDUE',
    );
  });
});

describe('teclado', () => {
  it('o primeiro Tab oferece pular direto para o conteúdo', async () => {
    mockApi({ ...session, 'GET /dashboard': ok(dashboardFixture()) });
    const { user } = renderApp('/dashboard', { token: 'jwt' });

    await screen.findByText('Ana Administradora');
    await user.tab();

    const skip = screen.getByRole('link', { name: 'Pular para o conteúdo' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#conteudo-principal');
    expect(document.getElementById('conteudo-principal')?.tagName).toBe('MAIN');
  });
});
