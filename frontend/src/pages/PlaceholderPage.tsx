import { Construction, type LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  /** Etapa do plano em que esta tela será construída. */
  stage: string;
}

/**
 * Tela ainda não construída.
 *
 * Existe para que o menu lateral esteja completo e navegável desde a Etapa 1:
 * um item de menu que leva a uma rota inexistente (ou a um 404) faz o sistema
 * parecer quebrado, mesmo estando apenas inacabado.
 */
export function PlaceholderPage({
  title,
  description,
  icon: Icon = Construction,
  stage,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Icon className="size-7" aria-hidden="true" />
          </span>

          <div className="max-w-md">
            <p className="font-medium text-foreground">Em construção</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta área será implementada na <strong>{stage}</strong>. A navegação, o controle de
              acesso e o layout já estão funcionando.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
