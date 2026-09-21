import { ArrowLeft, UserX } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ClientForm } from '@/components/clients/ClientForm';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useClient, useCreateClient, useUpdateClient } from '@/hooks/use-clients';
import type { ClientPayload } from '@/types/client';

/**
 * Cadastro e edição de cliente.
 *
 * Uma página para os dois casos: o formulário é idêntico, muda apenas a
 * origem dos valores iniciais e o destino da submissão. Duas páginas quase
 * iguais divergiriam na primeira vez que um campo fosse acrescentado.
 */
export function ClientFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const isEditing = Boolean(id);

  const { data: client, isPending, isError } = useClient(id);
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient(id ?? '');

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(payload: ClientPayload): void {
    if (isEditing && id) {
      updateMutation.mutate(payload, {
        onSuccess: () => navigate(`/clientes/${id}`),
      });
      return;
    }

    createMutation.mutate(payload, {
      // Vai direto à ficha do cliente recém-criado: é quase sempre onde a
      // pessoa quer estar em seguida, para criar o contrato.
      onSuccess: (created) => navigate(`/clientes/${created.id}`),
    });
  }

  function handleCancel(): void {
    navigate(isEditing && id ? `/clientes/${id}` : '/clientes');
  }

  if (isEditing && isError) {
    return (
      <Card>
        <EmptyState
          title="Cliente não encontrado"
          description="O cliente que você tentou editar não existe ou foi removido."
          icon={UserX}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/clientes">Voltar para a lista</Link>
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
          <Link to={isEditing && id ? `/clientes/${id}` : '/clientes'}>
            <ArrowLeft />
          </Link>
        </Button>

        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {isEditing ? 'Editar cliente' : 'Novo cliente'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEditing
              ? 'As alterações ficam registradas no histórico do cliente.'
              : 'Os campos marcados com * são obrigatórios.'}
          </p>
        </div>
      </div>

      <ClientForm
        {...(client ? { client } : {})}
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
