import { Check, Loader2, Search, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useClients } from '@/hooks/use-clients';
import { cn } from '@/lib/utils';
import type { ClientSummary } from '@/types/client';
import { formatCpfCnpj } from '@/utils/format';

/**
 * Seletor de cliente — usado pelo formulário de contrato e pelo de fatura.
 *
 * Por que não um `<Select>` com a lista de clientes: um escritório com
 * trezentos clientes produziria uma lista rolável de trezentos itens, e
 * carregá-la inteira a cada abertura do formulário seria desperdício. Pior,
 * qualquer teto de paginação esconderia clientes sem avisar — o usuário
 * concluiria que o cadastro sumiu.
 *
 * Aqui a busca vai à API, que é quem sabe procurar por nome, documento e
 * e-mail. Mostramos poucos resultados de cada vez porque o objetivo é
 * encontrar UM cliente, não navegar pela base.
 *
 * Clientes inativos aparecem, marcados como tais. Escondê-los deixaria o
 * usuário procurando um cadastro que existe; mostrá-los com o selo deixa a
 * decisão com quem está preenchendo.
 */

const RESULT_LIMIT = 6;

interface ClientPickerProps {
  /** Cliente já escolhido (edição) ou `null` no cadastro novo. */
  selected: ClientSummary | null;
  onSelect: (client: ClientSummary) => void;
  onClear: () => void;
  disabled?: boolean;
  /** Erro de validação vindo do formulário. */
  hasError?: boolean;
  /** Rótulo do botão que limpa a escolha. */
  clearLabel?: string;
}

export function ClientPicker({
  selected,
  onSelect,
  onClear,
  disabled = false,
  hasError = false,
  clearLabel = 'Trocar',
}: ClientPickerProps) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  // Sem o atraso, cada tecla digitada dispararia uma consulta ao banco.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isFetching } = useClients({
    page: 1,
    pageSize: RESULT_LIMIT,
    sort: 'name',
    order: 'asc',
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
  });

  if (selected) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"
          >
            <UserRound className="size-4" />
          </span>

          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{selected.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {selected.companyName ? `${selected.companyName} · ` : ''}
              {formatCpfCnpj(selected.cpfCnpj)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {selected.status === 'INACTIVE' && <ClientStatusBadge status="INACTIVE" />}

          <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
            <X />
            {clearLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, CPF/CNPJ ou e-mail…"
          className={cn('pl-9', hasError && 'border-destructive')}
          disabled={disabled}
          aria-label="Buscar cliente para o contrato"
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        {!data || data.items.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            {debounced.trim()
              ? 'Nenhum cliente encontrado para esta busca.'
              : 'Nenhum cliente cadastrado ainda.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      id: client.id,
                      name: client.name,
                      companyName: client.companyName,
                      cpfCnpj: client.cpfCnpj,
                      status: client.status,
                    })
                  }
                  disabled={disabled}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{client.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatCpfCnpj(client.cpfCnpj)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {client.status === 'INACTIVE' && <ClientStatusBadge status="INACTIVE" />}
                    <Check className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && data.total > data.items.length && (
        <p className="text-xs text-muted-foreground">
          Exibindo {data.items.length} de {data.total} clientes. Refine a busca para encontrar
          outros.
        </p>
      )}
    </div>
  );
}
