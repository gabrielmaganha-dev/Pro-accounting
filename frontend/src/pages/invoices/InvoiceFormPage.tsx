import { ArrowLeft, ReceiptText } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { InvoiceForm } from '@/components/invoices/InvoiceForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useClient } from '@/hooks/use-clients';
import { useContract } from '@/hooks/use-contracts';
import { useCreateInvoice, useInvoice, useUpdateInvoice } from '@/hooks/use-invoices';
import type { InvoicePayload } from '@/types/invoice';

/**
 * Emissão e edição de fatura.
 *
 * Uma página para os dois casos: o formulário é idêntico, muda apenas a origem
 * dos valores iniciais e o destino da submissão. Duas páginas quase iguais
 * divergiriam na primeira vez que um campo fosse acrescentado.
 */
export function InvoiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isEditing = Boolean(id);

  /**
   * Cliente e contrato pré-selecionados pela URL.
   *
   * É o caminho vindo dos botões "Nova fatura" das fichas de cliente e de
   * contrato: quem já está olhando um contrato não deveria precisar buscá-lo
   * de novo na tela seguinte. Ao vir de um contrato, o cliente é deduzido dele
   * — não há como escolher um par incoerente.
   */
  const presetClientId = searchParams.get('clienteId') ?? undefined;
  const presetContractId = searchParams.get('contratoId') ?? undefined;

  const { data: presetContract } = useContract(isEditing ? undefined : presetContractId);
  const { data: presetClient } = useClient(
    isEditing ? undefined : (presetContract?.clientId ?? presetClientId),
  );

  const { data: invoice, isPending, isError } = useInvoice(id);
  const createMutation = useCreateInvoice();
  const updateMutation = useUpdateInvoice(id ?? '');

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(payload: InvoicePayload): void {
    if (isEditing && id) {
      updateMutation.mutate(payload, {
        onSuccess: () => navigate(`/faturas/${id}`),
      });
      return;
    }

    createMutation.mutate(payload, {
      onSuccess: (created) => navigate(`/faturas/${created.id}`),
    });
  }

  function handleCancel(): void {
    navigate(isEditing && id ? `/faturas/${id}` : '/faturas');
  }

  if (isEditing && isError) {
    return (
      <Card>
        <EmptyState
          title="Fatura não encontrada"
          description="A fatura que você tentou editar não existe ou foi removida."
          icon={ReceiptText}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/faturas">Voltar para a lista</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  if (isEditing && isPending) {
    return <FormSkeleton />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Voltar">
          <Link to={isEditing && id ? `/faturas/${id}` : '/faturas'}>
            <ArrowLeft />
          </Link>
        </Button>

        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {isEditing ? 'Editar fatura' : 'Nova fatura'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEditing
              ? 'As alterações ficam registradas no histórico da fatura.'
              : 'Os campos marcados com * são obrigatórios. A situação é definida pelo sistema.'}
          </p>
        </div>
      </div>

      <InvoiceForm
        {...(invoice ? { invoice } : {})}
        {...(presetClient
          ? {
              initialClient: {
                id: presetClient.id,
                name: presetClient.name,
                companyName: presetClient.companyName,
                cpfCnpj: presetClient.cpfCnpj,
                status: presetClient.status,
              },
            }
          : {})}
        {...(presetContract ? { initialContractId: presetContract.id } : {})}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-56" />
      {[0, 1].map((index) => (
        <Card key={index}>
          <CardHeader className="pb-4">
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
