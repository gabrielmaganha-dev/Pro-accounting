import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { RegisterPaymentDialog } from '@/components/invoices/RegisterPaymentDialog';
import { ContractFormPage } from '@/pages/contracts/ContractFormPage';
import { InvoiceFormPage } from '@/pages/invoices/InvoiceFormPage';
import { todayIso } from '@/utils/date';

import { invoiceFixture, paginated } from '../utils/fixtures';
import { EMPLOYEE, renderWithProviders } from '../utils/render';
import { fail, mockApi, ok } from '../utils/server';

/**
 * As regras de negócio também são checadas no navegador, para o erro aparecer
 * no campo antes da ida ao servidor. A API revalida tudo (ver os testes do
 * backend); aqui o que se confere é a experiência de quem preenche.
 */

describe('contrato sem cliente', () => {
  it('não envia e aponta o campo Cliente', async () => {
    const { requests } = mockApi({
      'GET /contracts/next-number': ok({ number: 'CT-2026-0001' }),
      'GET /clients': ok(paginated([])),
    });
    const { user } = renderWithProviders(<ContractFormPage />, {
      route: '/contratos/novo',
      path: '/contratos/novo',
    });

    await waitFor(() => expect(screen.getByLabelText('Número do contrato *')).toHaveValue('CT-2026-0001'));
    await user.type(screen.getByLabelText('Tipo de serviço *'), 'Contabilidade mensal');
    await user.type(screen.getByLabelText('Valor mensal *'), '150000');
    await user.click(screen.getByRole('button', { name: /cadastrar contrato/i }));

    expect(await screen.findByText('Selecione o cliente do contrato.')).toBeInTheDocument();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);
  });

  it('valor mensal zero é recusado', async () => {
    mockApi({
      'GET /contracts/next-number': ok({ number: 'CT-2026-0001' }),
      'GET /clients': ok(paginated([])),
    });
    const { user } = renderWithProviders(<ContractFormPage />, {
      route: '/contratos/novo',
      path: '/contratos/novo',
    });

    await user.type(await screen.findByLabelText('Valor mensal *'), '0');
    await user.click(screen.getByRole('button', { name: /cadastrar contrato/i }));

    expect(await screen.findByLabelText('Valor mensal *')).toHaveValue('0,00');
    expect(await screen.findByText('O valor mensal precisa ser maior que zero.')).toBeInTheDocument();
  });
});

describe('fatura sem cliente', () => {
  it('não envia e aponta o campo Cliente', async () => {
    const { requests } = mockApi({
      'GET /invoices/next-number': ok({ number: 'FAT-2026-00001' }),
      'GET /clients': ok(paginated([])),
    });
    const { user } = renderWithProviders(<InvoiceFormPage />, {
      route: '/faturas/nova',
      path: '/faturas/nova',
    });

    await waitFor(() => expect(screen.getByLabelText('Número *')).toHaveValue('FAT-2026-00001'));
    await user.type(screen.getByLabelText('Valor *'), '50000');
    await user.click(screen.getByRole('button', { name: /emitir fatura/i }));

    expect(await screen.findByText('Selecione o cliente da fatura.')).toBeInTheDocument();
    expect(requests.some((request) => request.method === 'POST')).toBe(false);
  });
});

/** O diálogo é controlado pela página; aqui um invólucro mínimo faz esse papel. */
function PaymentHarness({ outstanding = '1500.00' }: { outstanding?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <span data-testid="dialog-state">{open ? 'aberto' : 'fechado'}</span>
      <RegisterPaymentDialog
        invoice={invoiceFixture({ outstanding })}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

describe('pagamento inválido (diálogo de registro)', () => {
  it('vem preenchido com o saldo em aberto e a data de hoje', async () => {
    mockApi({});
    renderWithProviders(<PaymentHarness outstanding="600.00" />, { user: EMPLOYEE });

    expect(await screen.findByLabelText('Valor recebido *')).toHaveValue('600,00');
    expect(screen.getByLabelText('Data do pagamento *')).toHaveValue(todayIso());
    expect(screen.getByLabelText('Data do pagamento *')).toHaveAttribute('max', todayIso());
  });

  it('recusa valor zero', async () => {
    mockApi({});
    const { user } = renderWithProviders(<PaymentHarness />);

    await user.clear(await screen.findByLabelText('Valor recebido *'));
    await user.click(screen.getByRole('button', { name: /revisar|continuar|avançar/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Informe um valor maior que zero.');
  });

  it('recusa valor acima do saldo em aberto', async () => {
    mockApi({});
    const { user } = renderWithProviders(<PaymentHarness outstanding="100.00" />);

    const amount = await screen.findByLabelText('Valor recebido *');
    await user.clear(amount);
    await user.type(amount, '10001');
    await user.click(screen.getByRole('button', { name: /revisar|continuar|avançar/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/excede o saldo em aberto/);
  });

  it('recusa data no futuro', async () => {
    mockApi({});
    const { user } = renderWithProviders(<PaymentHarness />);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const date = await screen.findByLabelText('Data do pagamento *');
    await user.clear(date);
    await user.type(date, todayIso(tomorrow));
    await user.click(screen.getByRole('button', { name: /revisar|continuar|avançar/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('A data do pagamento não pode ser no futuro.');
  });

  it('pagamento válido: revisa, confirma, envia e fecha', async () => {
    const { requests } = mockApi({
      'POST /invoices/inv-1/payments': ok(invoiceFixture({ status: 'PAID', outstanding: '0.00' }), 201),
    });
    const { user } = renderWithProviders(<PaymentHarness />);

    await user.click(await screen.findByRole('button', { name: /revisar|continuar|avançar/i }));
    await user.click(await screen.findByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(screen.getByTestId('dialog-state')).toHaveTextContent('fechado'));
    expect(requests.find((request) => request.method === 'POST')?.body).toEqual({
      amount: '1500.00',
      paymentDate: todayIso(),
      paymentMethod: 'PIX',
    });
  });

  it('duplicata recusada pela API oferece "registrar assim mesmo"', async () => {
    let attempts = 0;
    const { requests } = mockApi({
      'POST /invoices/inv-1/payments': () => {
        attempts += 1;
        return attempts === 1
          ? fail(409, 'CONFLICT', 'Já existe um pagamento de R$ 1.500,00 nesta fatura, na mesma data e pela mesma forma.')
          : ok(invoiceFixture({ status: 'PAID' }), 201);
      },
    });
    const { user } = renderWithProviders(<PaymentHarness />);

    await user.click(await screen.findByRole('button', { name: /revisar|continuar|avançar/i }));
    await user.click(await screen.findByRole('button', { name: /confirmar/i }));

    const force = await screen.findByRole('button', { name: /assim mesmo/i });
    await user.click(force);

    await waitFor(() => expect(screen.getByTestId('dialog-state')).toHaveTextContent('fechado'));
    expect(requests[1]?.body).toMatchObject({ confirmDuplicate: true });
  });
});
