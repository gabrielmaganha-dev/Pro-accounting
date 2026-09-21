import { ArrowLeft, FileX } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { ContractForm } from '@/components/contracts/ContractForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useClient } from '@/hooks/use-clients';
import { useContract, useCreateContract, useUpdateContract } from '@/hooks/use-contracts';
import type { ContractPayload } from '@/types/contract';

/**
 * Cadastro e edição de contrato.
 *
 * Uma página para os dois casos: o formulário é idêntico, muda apenas a origem
 * dos valores iniciais e o destino da submissão. Duas páginas quase iguais
 * divergiriam na primeira vez que um campo fosse acrescentado.
 */
export function ContractFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isEditing = Boolean(id);

  /**
   * Cliente pré-selecionado via `/contratos/novo?clienteId=...`.
   *
   * É o caminho vindo do botão "Novo contrato" da ficha do cliente: quem já
   * está olhando um cliente não deveria precisar buscá-lo de novo na tela
   * seguinte.
   */
  const presetClientId = searchParams.get('clienteId') ?? undefined;
  const { data: presetClient } = useClient(isEditing ? undefined : presetClientId);

  const { data: contract, isPending, isError } = useContract(id);
  const createMutation = useCreateContract();
  const updateMutation = useUpdateContract(id ?? '');

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(payload: ContractPayload): void {
    if (isEditing && id) {
      updateMutation.mutate(payload, {
        onSuccess: () => navigate(`/contratos/${id}`),
      });
      return;
    }

    createMutation.mutate(payload, {
      onSuccess: (created) => navigate(`/contratos/${created.id}`),
    });
  }

  function handleCancel(): void {
    navigate(isEditing && id ? `/contratos/${id}` : '/contratos');
  }

  if (isEditing && isError) {
    return (
      <Card>
        <EmptyState
          title="Contrato não encontrado"
          description="O contrato que você tentou editar não existe ou foi removido."
          icon={FileX}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/contratos">Voltar para a lista</Link>
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
          <Link to={isEditing && id ? `/contratos/${id}` : '/contratos'}>
            <ArrowLeft />
          </Link>
        </Button>

        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {isEditing ? 'Editar contrato' : 'Novo contrato'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEditing
              ? 'Alterações de vigência e valor afetam as próximas faturas, não as já emitidas.'
              : 'Os campos marcados com * são obrigatórios.'}
          </p>
        </div>
      </div>

      <ContractForm
        {...(contract ? { contract } : {})}
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
      {[0, 1, 2].map((index) => (
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
