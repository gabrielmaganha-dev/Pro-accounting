import { fetchFile, saveBlob } from '@/services/download';
import type { Invoice } from '@/types/invoice';

/**
 * Fatura em PDF no navegador: visualizar, baixar e imprimir.
 *
 * O PDF é montado pela API (`GET /invoices/:id/pdf`), que confere o login e
 * registra a emissão na auditoria. Aqui só se decide o que fazer com o arquivo.
 * A API exige o token no cabeçalho, então o PDF não pode ser aberto por um
 * link comum: ele é baixado para a memória (`blob:`) e exibido de lá — o que
 * também mantém CPF/CNPJ e endereço do cliente fora de qualquer URL.
 */

type InvoiceRef = Pick<Invoice, 'id' | 'number'>;

/**
 * O que de fato aconteceu: abriu/imprimiu (`shown`), ou o arquivo foi baixado
 * no lugar — porque o navegador não exibe PDF (`downloaded`) ou porque barrou a
 * aba nova (`blocked`). A diferença muda o aviso: cada caso tem um remédio.
 */
export type InvoicePdfOutcome = 'shown' | 'downloaded' | 'blocked';

function pdfPath(
  invoice: InvoiceRef,
  disposition: 'inline' | 'attachment',
  purpose?: 'print',
): string {
  const query = `disposition=${disposition}${purpose ? `&purpose=${purpose}` : ''}`;
  return `/invoices/${invoice.id}/pdf?${query}`;
}

function fallbackName(invoice: InvoiceRef): string {
  return `Fatura_${invoice.number}.pdf`;
}

/**
 * O navegador exibe PDF sozinho?
 *
 * `false` quando o visualizador está desligado ("Baixar PDFs" nas
 * configurações do Chrome) ou não existe (Chrome no Android). Aí uma aba ou um
 * iframe com o PDF viraria um download com nome sem sentido — ou nem terminaria
 * de carregar —, então o certo é baixar o arquivo com o nome da fatura.
 * Navegador antigo, sem a propriedade: tenta exibir.
 */
function canDisplayPdf(): boolean {
  return navigator.pdfViewerEnabled !== false;
}

/** Baixa o arquivo `Fatura_<número>.pdf`. */
export async function downloadInvoicePdf(invoice: InvoiceRef): Promise<void> {
  const file = await fetchFile(pdfPath(invoice, 'attachment'), fallbackName(invoice));
  saveBlob(file.blob, file.filename);
}

/**
 * Abre a fatura numa aba nova, no visualizador de PDF do navegador.
 *
 * A aba é aberta ANTES da requisição, ainda dentro do clique: aberta depois do
 * `await`, o bloqueador de pop-ups a barraria. Enquanto o PDF chega ela mostra
 * um aviso, e é fechada se a geração falhar. Se o bloqueador barrar mesmo
 * assim, o arquivo é baixado — sair da tela do sistema perderia o que estava
 * aberto nela.
 *
 * O endereço `blob:` não é liberado depois de aberto: o botão "Baixar" do
 * visualizador volta a lê-lo, e liberá-lo cedo faria esse botão falhar. O
 * custo é a fatura (dezenas de KB) ficar em memória até a aba do sistema
 * fechar.
 */
export async function openInvoicePdf(invoice: InvoiceRef): Promise<InvoicePdfOutcome> {
  if (!canDisplayPdf()) {
    await downloadInvoicePdf(invoice);
    return 'downloaded';
  }

  const tab = window.open('', '_blank');

  if (tab) {
    tab.document.title = `Fatura ${invoice.number}`;
    tab.document.body.textContent = 'Gerando a fatura…';
  }

  try {
    const file = await fetchFile(pdfPath(invoice, 'inline'), fallbackName(invoice));

    if (!tab) {
      saveBlob(file.blob, file.filename);
      return 'blocked';
    }

    tab.location.href = URL.createObjectURL(file.blob);
    return 'shown';
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/** Quanto esperar o visualizador carregar o PDF no iframe antes de desistir. */
const PRINT_LOAD_TIMEOUT_MS = 15_000;

/**
 * Abre o diálogo de impressão com a fatura, sem sair da tela.
 *
 * O PDF é carregado num `<iframe>` invisível e impresso de lá. Ele precisa
 * estar na página (não `display: none`): oculto desse jeito, o navegador nem
 * carrega o visualizador de PDF. A política de segurança libera `frame-src
 * blob:` justamente para isto (ver frontend/nginx/security-headers.conf).
 *
 * Se o visualizador não carregar em 15 s, desiste com uma mensagem em vez de
 * deixar o menu travado em "Gerando…". O iframe e o `blob:` são liberados em
 * qualquer saída: na hora, se falhou; um minuto depois, se imprimiu (tirá-los
 * com o diálogo de impressão aberto cancela a impressão em alguns navegadores).
 */
export async function printInvoicePdf(invoice: InvoiceRef): Promise<InvoicePdfOutcome> {
  if (!canDisplayPdf()) {
    await downloadInvoicePdf(invoice);
    return 'downloaded';
  }

  const file = await fetchFile(pdfPath(invoice, 'inline', 'print'), fallbackName(invoice));
  const url = URL.createObjectURL(file.blob);

  const frame = document.createElement('iframe');
  frame.title = `Impressão da fatura ${invoice.number}`;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';

  let printing = false;

  try {
    const loaded = await new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(false), PRINT_LOAD_TIMEOUT_MS);

      frame.addEventListener(
        'load',
        () => {
          window.clearTimeout(timer);
          resolve(true);
        },
        { once: true },
      );

      frame.src = url;
      document.body.appendChild(frame);
    });

    if (!loaded) {
      throw new Error(
        'O navegador não abriu a fatura para impressão. Use "Baixar PDF" e imprima pelo arquivo.',
      );
    }

    // O visualizador termina de montar o documento um instante depois do
    // `load`; imprimir antes disso sai em branco em alguns navegadores.
    await new Promise((resolve) => window.setTimeout(resolve, 300));

    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    printing = true;

    return 'shown';
  } finally {
    const cleanup = () => {
      frame.remove();
      URL.revokeObjectURL(url);
    };

    if (printing) window.setTimeout(cleanup, 60_000);
    else cleanup();
  }
}
