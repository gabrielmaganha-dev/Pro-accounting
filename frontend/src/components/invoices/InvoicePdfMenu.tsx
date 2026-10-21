import { Download, Eye, FileText, Loader2, Mail, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { InvoiceEmailDialog } from '@/components/invoices/InvoiceEmailDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  downloadInvoicePdf,
  openInvoicePdf,
  printInvoicePdf,
  type InvoicePdfOutcome,
} from '@/services/invoice-pdf';
import type { Invoice } from '@/types/invoice';

/**
 * Ações da fatura em PDF: visualizar, baixar, imprimir e enviar por e-mail.
 *
 * Cada ação gera o documento na hora, com os dados atuais da fatura — gerar
 * não altera a situação dela. Usado na coluna de ações da listagem (só o
 * ícone) e no cabeçalho da ficha da fatura (com texto).
 */
interface InvoicePdfMenuProps {
  invoice: Invoice;
  /** Só o ícone, para a coluna estreita de ações da tabela. */
  compact?: boolean;
}

type PdfAction = 'open' | 'download' | 'print';

/** Mensagem de sucesso conforme o que aconteceu de fato. */
function outcomeMessage(outcome: InvoicePdfOutcome): string | undefined {
  switch (outcome) {
    case 'downloaded':
      return 'Seu navegador baixa PDFs em vez de abri-los: a fatura foi baixada. Abra o arquivo para ver ou imprimir.';
    case 'blocked':
      return 'O navegador bloqueou a janela nova, então a fatura foi baixada. Para abrir na tela, permita janelas pop-up deste site.';
    case 'shown':
      return undefined;
  }
}

export function InvoicePdfMenu({ invoice, compact = false }: InvoicePdfMenuProps) {
  const [pending, setPending] = useState<PdfAction | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  /**
   * A tarefa é chamada no mesmo instante do clique, antes de qualquer `await`:
   * "Visualizar" abre a aba nova ali, e uma aba aberta depois de uma espera é
   * barrada pelo bloqueador de pop-ups.
   */
  function run(action: PdfAction, task: () => Promise<string | undefined>): void {
    setPending(action);

    task()
      .then((success) => {
        if (success) toast.success(success);
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : 'Não foi possível gerar a fatura em PDF.',
        );
      })
      .finally(() => setPending(null));
  }

  const busy = pending !== null;
  const icon = busy ? <Loader2 className="animate-spin" /> : <FileText />;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {compact ? (
            <Button
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Fatura ${invoice.number} em PDF`}
              title="Fatura em PDF"
            >
              {icon}
            </Button>
          ) : (
            <Button variant="outline" disabled={busy}>
              {icon}
              {busy ? 'Gerando…' : 'PDF'}
            </Button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">Fatura em PDF</p>
            <p className="text-xs text-muted-foreground">{invoice.number}</p>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => run('open', () => openInvoicePdf(invoice).then(outcomeMessage))}
          >
            <Eye className="size-4" />
            Visualizar
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() =>
              run('download', () => downloadInvoicePdf(invoice).then(() => 'PDF baixado.'))
            }
          >
            <Download className="size-4" />
            Baixar PDF
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => run('print', () => printInvoicePdf(invoice).then(outcomeMessage))}
          >
            <Printer className="size-4" />
            Imprimir
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => setEmailOpen(true)}>
            <Mail className="size-4" />
            Enviar por e-mail
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InvoiceEmailDialog invoice={invoice} open={emailOpen} onOpenChange={setEmailOpen} />
    </>
  );
}
