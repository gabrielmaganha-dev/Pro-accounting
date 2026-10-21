import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InvoicePdfMenu } from '@/components/invoices/InvoicePdfMenu';
import { InvoicesListPage } from '@/pages/invoices/InvoicesListPage';
import { invoiceEmailDraft, mailtoHref } from '@/utils/invoice-email';

import { invoiceFixture, paginated } from '../utils/fixtures';
import { EMPLOYEE, renderWithProviders } from '../utils/render';
import { fail, file, mockApi } from '../utils/server';

/**
 * Fatura em PDF na interface. O conteúdo do PDF é conferido nos testes do
 * backend; aqui o que importa é a mecânica: qual rota é chamada, com o token,
 * e o que acontece com o arquivo.
 */

const PDF = file('%PDF-1.7 teste', 'application/pdf', 'Fatura_FAT-2026-00001.pdf');

// O jsdom não implementa `blob:`; o endereço criado é só conferido.
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  window.localStorage.setItem('pro-accounting:token', 'token-de-teste');
  URL.createObjectURL = vi.fn(() => 'blob:fatura');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

async function openMenu(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.click(screen.getByRole('button', { name: /pdf/i }));
}

describe('menu da fatura em PDF', () => {
  it('Baixar PDF: pede o arquivo com o token e salva com o nome dado pelo servidor', async () => {
    const { requests } = mockApi({ 'GET /invoices/inv-1/pdf': PDF });
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });

    const { user } = renderWithProviders(<InvoicePdfMenu invoice={invoiceFixture()} />, {
      user: EMPLOYEE,
    });

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /baixar pdf/i }));

    await waitFor(() => expect(saved).toEqual(['Fatura_FAT-2026-00001.pdf']));
    expect(await screen.findByText('PDF baixado.')).toBeInTheDocument();

    const pdfRequest = requests.find((request) => request.path === '/invoices/inv-1/pdf');
    expect(pdfRequest?.query.get('disposition')).toBe('attachment');
    expect(pdfRequest?.headers.Authorization).toBe('Bearer token-de-teste');
  });

  it('Visualizar: abre a aba já no clique e a leva ao PDF quando ele chega', async () => {
    const { requests } = mockApi({ 'GET /invoices/inv-1/pdf': PDF });
    const tab = {
      document: { title: '', body: { textContent: '' } },
      location: { href: '' },
      close: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

    const { user } = renderWithProviders(<InvoicePdfMenu invoice={invoiceFixture()} />);

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /visualizar/i }));

    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(tab.location.href).toBe('blob:fatura'));
    expect(tab.document.title).toBe('Fatura FAT-2026-00001');
    expect(tab.close).not.toHaveBeenCalled();

    const pdfRequest = requests.find((request) => request.path === '/invoices/inv-1/pdf');
    expect(pdfRequest?.query.get('disposition')).toBe('inline');
  });

  it('Visualizar com erro da API: fecha a aba e mostra a mensagem do servidor', async () => {
    mockApi({ 'GET /invoices/inv-1/pdf': fail(404, 'NOT_FOUND', 'Fatura não encontrada.') });
    const tab = {
      document: { title: '', body: { textContent: '' } },
      location: { href: '' },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

    const { user } = renderWithProviders(<InvoicePdfMenu invoice={invoiceFixture()} />);

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /visualizar/i }));

    expect(await screen.findByText('Fatura não encontrada.')).toBeInTheDocument();
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe('');
  });

  it('navegador que baixa PDFs em vez de abrir: Visualizar e Imprimir baixam o arquivo e avisam', async () => {
    Object.defineProperty(window.navigator, 'pdfViewerEnabled', { value: false, configurable: true });

    try {
      const { requests } = mockApi({ 'GET /invoices/inv-1/pdf': PDF });
      const open = vi.spyOn(window, 'open');
      const saved: string[] = [];
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        saved.push(this.download);
      });

      const { user } = renderWithProviders(<InvoicePdfMenu invoice={invoiceFixture()} />);

      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /visualizar/i }));
      await waitFor(() => expect(saved).toHaveLength(1));

      await openMenu(user);
      await user.click(await screen.findByRole('menuitem', { name: /imprimir/i }));
      await waitFor(() => expect(saved).toHaveLength(2));

      // Nenhuma aba em branco nem iframe: o arquivo sai com o nome da fatura.
      expect(open).not.toHaveBeenCalled();
      expect(saved).toEqual(['Fatura_FAT-2026-00001.pdf', 'Fatura_FAT-2026-00001.pdf']);
      expect(document.querySelector('iframe')).toBeNull();
      expect((await screen.findAllByText(/baixa PDFs em vez de abri-los/i)).length).toBeGreaterThan(0);
      expect(requests.filter((request) => request.path === '/invoices/inv-1/pdf')).toHaveLength(2);
    } finally {
      delete (window.navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled;
    }
  });

  it('pop-up bloqueado: Visualizar baixa o arquivo em vez de tirar a pessoa da tela', async () => {
    mockApi({ 'GET /invoices/inv-1/pdf': PDF });
    vi.spyOn(window, 'open').mockReturnValue(null);
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });

    const { user } = renderWithProviders(<InvoicePdfMenu invoice={invoiceFixture()} />);

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /visualizar/i }));

    await waitFor(() => expect(saved).toEqual(['Fatura_FAT-2026-00001.pdf']));
    expect(await screen.findByText(/bloqueou a janela nova/i)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('Enviar por e-mail: prepara a mensagem sem enviar nada pelo sistema', async () => {
    const { requests } = mockApi({});

    const { user } = renderWithProviders(<InvoicePdfMenu invoice={invoiceFixture()} />);

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /enviar por e-mail/i }));

    expect(await screen.findByText(/ainda não envia e-mails sozinho/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Para')).toHaveValue('financeiro@paoquente.com.br');
    await waitFor(() =>
      expect(screen.getByLabelText('Assunto')).toHaveValue(
        'Fatura FAT-2026-00001 — Escritório de Teste',
      ),
    );

    const message = (screen.getByLabelText('Mensagem') as HTMLTextAreaElement).value;
    expect(message).toMatch(/R\$\s1\.500,00/);
    expect(message).toContain('30/09/2026');
    expect(message).toContain('Forma de pagamento: PIX CNPJ 11222333000181.');

    // Nenhuma chamada que envie ou registre envio: só a leitura de configurações.
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(requests.some((request) => request.path.includes('/pdf'))).toBe(false);
  });
});

describe('mensagem de e-mail da fatura', () => {
  it('destinatário, assunto e corpo no link mailto, com quebras de linha \\r\\n', () => {
    const draft = invoiceEmailDraft(invoiceFixture(), {
      name: 'Escritório Modelo Contabilidade',
      paymentInstructions: null,
    });

    expect(draft.to).toBe('financeiro@paoquente.com.br');
    expect(draft.subject).toBe('Fatura FAT-2026-00001 — Escritório Modelo Contabilidade');
    expect(draft.message).not.toContain('Forma de pagamento');

    const href = mailtoHref(draft);
    expect(href.startsWith('mailto:financeiro%40paoquente.com.br?subject=Fatura%20FAT-2026-00001')).toBe(
      true,
    );
    expect(decodeURIComponent(href.split('&body=')[1] ?? '')).toContain('\r\n');
  });

  it('cliente sem e-mail: destinatário em branco para a pessoa preencher', () => {
    const invoice = invoiceFixture();
    const draft = invoiceEmailDraft(
      { ...invoice, client: { ...invoice.client, email: null } },
      { name: '', paymentInstructions: null },
    );

    expect(draft.to).toBe('');
    expect(draft.subject).toBe('Fatura FAT-2026-00001');
  });
});

describe('listagem de faturas', () => {
  it('cada linha tem o botão da fatura em PDF na coluna de ações', async () => {
    mockApi({ 'GET /invoices': { body: { success: true, data: paginated([invoiceFixture()]) } } });

    renderWithProviders(<InvoicesListPage />, { route: '/faturas', path: '/faturas' });

    expect(
      await screen.findByRole('button', { name: 'Fatura FAT-2026-00001 em PDF' }),
    ).toBeInTheDocument();
  });
});
