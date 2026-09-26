import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClientFormPage } from '@/pages/clients/ClientFormPage';

import { clientDetailFixture } from '../utils/fixtures';
import { EMPLOYEE, renderWithProviders } from '../utils/render';
import { fail, mockApi, ok } from '../utils/server';

function renderNew() {
  return renderWithProviders(<ClientFormPage />, { route: '/clientes/novo', path: '/clientes/novo' });
}

function renderEdit(user = EMPLOYEE) {
  return renderWithProviders(<ClientFormPage />, {
    route: '/clientes/c-1/editar',
    path: '/clientes/:id/editar',
    user,
  });
}

const nameField = () => screen.getByLabelText('Nome / Razão social *');
const documentField = () => screen.getByLabelText('CPF / CNPJ *');
const submitButton = () => screen.getByRole('button', { name: /cadastrar cliente|salvar alterações/i });

describe('cadastro de cliente — validação no navegador', () => {
  it('aponta os obrigatórios sem chamar a API', async () => {
    const { requests } = mockApi({});
    const { user } = renderNew();

    await user.click(submitButton());

    expect(
      await screen.findByText('Informe o nome ou a razão social (mínimo 2 caracteres).'),
    ).toBeInTheDocument();
    expect(screen.getByText('Informe o CPF ou CNPJ.')).toBeInTheDocument();
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toHaveLength(0);
  });

  it('recusa CPF com dígito errado, e-mail, telefone e CEP inválidos', async () => {
    mockApi({});
    const { user } = renderNew();

    await user.type(nameField(), 'Maria Silva');
    await user.type(documentField(), '52998224724');
    await user.type(screen.getByLabelText('E-mail'), 'maria@');
    await user.type(screen.getByLabelText('Telefone'), '1133');
    await user.type(screen.getByLabelText('CEP'), '0131');
    await user.click(submitButton());

    expect(
      await screen.findByText('CPF ou CNPJ inválido. Confira os números digitados.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
    expect(screen.getByText('Telefone inválido. Use DDD + número.')).toBeInTheDocument();
    expect(screen.getByText('CEP deve ter 8 dígitos.')).toBeInTheDocument();
  });

  it('aplica as máscaras enquanto se digita', async () => {
    mockApi({});
    const { user } = renderNew();

    await user.type(documentField(), '11222333000181');
    await user.type(screen.getByLabelText('WhatsApp'), '11988887777');

    expect(documentField()).toHaveValue('11.222.333/0001-81');
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('(11) 98888-7777');
  });
});

describe('cadastro de cliente — envio', () => {
  it('envia os dados LIMPOS, mostra "Salvando…" e abre a ficha criada', async () => {
    const { requests } = mockApi({
      'POST /clients': {
        ...ok(clientDetailFixture({ id: 'c-novo', name: 'Maria Silva' }), 201),
        delayMs: 100,
      },
    });
    const { user } = renderNew();

    await user.type(nameField(), '  Maria Silva ');
    await user.type(documentField(), '52998224725');
    await user.type(screen.getByLabelText('Telefone'), '1133334444');
    await user.click(submitButton());

    expect(await screen.findByRole('button', { name: /salvando/i })).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/clientes/c-novo'),
    );

    expect(requests[0]?.body).toMatchObject({
      name: 'Maria Silva',
      cpfCnpj: '52998224725',
      phone: '1133334444',
      email: null,
      status: 'ACTIVE',
    });
  });

  it('CPF duplicado: a mensagem da API aparece NO CAMPO do documento', async () => {
    mockApi({
      'POST /clients': fail(409, 'CONFLICT', 'Este CPF/CNPJ já está cadastrado para "João".'),
    });
    const { user } = renderNew();

    await user.type(nameField(), 'Maria Silva');
    await user.type(documentField(), '52998224725');
    await user.click(submitButton());

    const messages = await screen.findAllByText('Este CPF/CNPJ já está cadastrado para "João".');
    // Uma no campo (e outra no toast).
    expect(messages.length).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(documentField()).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByTestId('location')).toHaveTextContent('/clientes/novo');
    expect(submitButton()).toBeEnabled();
  });

  it('erro de validação da API é destacado no campo correspondente', async () => {
    mockApi({
      'POST /clients': fail(422, 'VALIDATION_ERROR', 'UF inválida.', [
        { field: 'state', message: 'UF inválida.' },
        { field: 'email', message: 'Domínio de e-mail recusado.' },
      ]),
    });
    const { user } = renderNew();

    await user.type(nameField(), 'Maria Silva');
    await user.type(documentField(), '52998224725');
    await user.type(screen.getByLabelText('E-mail'), 'maria@exemplo.com');
    await user.click(submitButton());

    expect(await screen.findByText('Domínio de e-mail recusado.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('edição de cliente', () => {
  it('mostra esqueleto enquanto carrega', async () => {
    mockApi({ 'GET /clients/c-1': { ...ok(clientDetailFixture()), delayMs: 200 } });
    const { container } = renderEdit();

    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(await screen.findByDisplayValue('Padaria Pão Quente Ltda')).toBeInTheDocument();
  });

  it('cliente inexistente mostra aviso, não um formulário vazio', async () => {
    mockApi({ 'GET /clients/c-1': fail(404, 'NOT_FOUND', 'Cliente não encontrado.') });
    renderEdit();

    expect(await screen.findByText('Cliente não encontrado')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome / Razão social *')).not.toBeInTheDocument();
  });

  it('funcionário: identidade fiscal bloqueada, contato liberado', async () => {
    mockApi({ 'GET /clients/c-1': ok(clientDetailFixture()) });
    renderEdit(EMPLOYEE);

    expect(await screen.findByText(/Seu perfil é/)).toBeInTheDocument();
    expect(nameField()).toBeDisabled();
    expect(documentField()).toBeDisabled();
    expect(screen.getByLabelText('E-mail')).toBeEnabled();
    expect(screen.getByLabelText('Telefone')).toBeEnabled();
  });

  it('funcionário salva a edição; campo apagado vai como null para ser limpo na API', async () => {
    const { requests } = mockApi({
      'GET /clients/c-1': ok(clientDetailFixture()),
      'PUT /clients/c-1': ok(clientDetailFixture({ email: null })),
    });
    const { user } = renderEdit(EMPLOYEE);

    const email = await screen.findByLabelText('E-mail');
    await user.clear(email);
    await user.click(submitButton());

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/clientes/c-1'));

    const put = requests.find((request) => request.method === 'PUT');
    expect(put?.body).toMatchObject({
      name: 'Padaria Pão Quente Ltda',
      cpfCnpj: '11222333000181',
      email: null,
      phone: '1133334444',
    });
  });
});
