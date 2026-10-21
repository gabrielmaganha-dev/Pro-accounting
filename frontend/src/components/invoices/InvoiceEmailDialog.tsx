import { Copy, Download, Loader2, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSettings } from '@/hooks/use-settings';
import { downloadInvoicePdf } from '@/services/invoice-pdf';
import type { Invoice } from '@/types/invoice';
import { invoiceEmailDraft, mailtoHref } from '@/utils/invoice-email';

/**
 * Envio da fatura por e-mail — pelo programa de e-mail de quem usa o sistema.
 *
 * O sistema ainda não envia e-mail sozinho, e esta tela não finge que envia:
 * ela prepara destinatário, assunto e mensagem, baixa o PDF e abre o programa
 * de e-mail para a pessoa anexar o arquivo e enviar. Nada aqui marca a fatura
 * como enviada. Quando houver um serviço de e-mail, é o botão "Abrir no
 * e-mail" que vira "Enviar".
 */
interface InvoiceEmailDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvoiceEmailDialog({ invoice, open, onOpenChange }: InvoiceEmailDialogProps) {
  const { data } = useSettings();
  const companyName = data?.settings.companyName ?? '';
  const paymentInstructions = data?.settings.invoicePaymentInstructions ?? null;

  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [downloading, setDownloading] = useState(false);

  // Reabre sempre com o texto padrão: um rascunho de outra fatura não pode
  // sobrar no formulário.
  useEffect(() => {
    if (!open) return;

    const draft = invoiceEmailDraft(invoice, { name: companyName, paymentInstructions });
    setTo(draft.to);
    setSubject(draft.subject);
    setMessage(draft.message);
  }, [open, invoice, companyName, paymentInstructions]);

  async function handleDownload(): Promise<void> {
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoice);
      toast.success('PDF baixado. Anexe-o à mensagem.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar o PDF.');
    } finally {
      setDownloading(false);
    }
  }

  function handleOpenMail(): void {
    window.location.href = mailtoHref({ to, subject, message });
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${message}`);
      toast.success('Assunto e mensagem copiados.');
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Enviar fatura por e-mail</AlertDialogTitle>
          <AlertDialogDescription>
            O sistema ainda não envia e-mails sozinho. Baixe o PDF, abra a mensagem no seu
            programa de e-mail e anexe o arquivo antes de enviar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invoice-email-to">Para</Label>
            <Input
              id="invoice-email-to"
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="email@cliente.com.br"
            />
            {!invoice.client.email && (
              <p className="text-xs text-muted-foreground">
                O cadastro deste cliente não tem e-mail. Digite o endereço ou cadastre-o na ficha
                do cliente.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-email-subject">Assunto</Label>
            <Input
              id="invoice-email-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-email-message">Mensagem</Label>
            <Textarea
              id="invoice-email-message"
              rows={8}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
        </div>

        {/* No celular os botões empilham na ordem dos passos (1, 2) e o Fechar
            vai para o fim; do tablet em diante ficam numa linha, com o passo 2
            — a ação principal — à direita. */}
        <AlertDialogFooter className="flex-col sm:flex-row sm:flex-wrap">
          <AlertDialogCancel className="order-4 sm:order-none">Fechar</AlertDialogCancel>
          <Button
            variant="outline"
            className="order-3 sm:order-none"
            onClick={() => void handleCopy()}
          >
            <Copy />
            Copiar texto
          </Button>
          <Button
            variant="outline"
            className="order-1 sm:order-none"
            onClick={() => void handleDownload()}
            disabled={downloading}
          >
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            1. Baixar PDF
          </Button>
          <Button className="order-2 sm:order-none" onClick={handleOpenMail}>
            <Mail />
            2. Abrir no e-mail
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
