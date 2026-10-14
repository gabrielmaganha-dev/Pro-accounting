import { CalendarRange, X } from 'lucide-react';

import { ClientPicker } from '@/components/clients/ClientPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ClientSummary } from '@/types/client';
import type { ReportCatalogItem, ReportFilters as Filters } from '@/types/report';

/** Valor usado pelo Select para representar "sem filtro". */
const ALL = '__all__';

/**
 * Filtros do relatório selecionado.
 *
 * Cada controle só aparece se o relatório o ACEITAR — a declaração vem do
 * catálogo, do backend. "Contratos vencendo", por exemplo, não mostra datas:
 * a janela dele é sempre contada a partir de hoje, e oferecer um campo que a
 * consulta ignora é pior do que não oferecer nada.
 */
interface ReportFiltersProps {
  report: ReportCatalogItem;
  value: Filters;
  onChange: (next: Filters) => void;
  /**
   * O cliente escolhido vive na página, não aqui.
   *
   * O `ClientPicker` precisa do objeto inteiro para exibir nome e documento,
   * mas o filtro enviado à API é só o id. Guardar os dois no mesmo lugar evita
   * que "Limpar filtros" zere o id e deixe o nome antigo na tela.
   */
  selectedClient: ClientSummary | null;
  onSelectClient: (client: ClientSummary | null) => void;
  disabled?: boolean;
}

export function ReportFilters({
  report,
  value,
  onChange,
  selectedClient,
  onSelectClient,
  disabled,
}: ReportFiltersProps) {
  const { period, client, statuses } = report.filters;

  const hasAny = Boolean(value.from || value.to || value.clientId || value.status);

  function update(patch: Partial<Filters>): void {
    const next = { ...value, ...patch };

    // Campo vazio some do objeto: um `from: ''` viraria `?from=` na URL e a API
    // recusaria a string vazia onde espera ausência.
    for (const key of Object.keys(next) as (keyof Filters)[]) {
      if (!next[key]) delete next[key];
    }

    onChange(next);
  }

  if (!period && !client && statuses.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Este relatório não aceita filtros — o recorte dele é fixo.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-4 lg:grid-cols-4">
          {period && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="report-from">Data inicial</Label>
                <Input
                  id="report-from"
                  type="date"
                  value={value.from ?? ''}
                  onChange={(event) => update({ from: event.target.value })}
                  disabled={disabled}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="report-to">Data final</Label>
                <Input
                  id="report-to"
                  type="date"
                  value={value.to ?? ''}
                  onChange={(event) => update({ to: event.target.value })}
                  disabled={disabled}
                  {...(value.from ? { min: value.from } : {})}
                />
              </div>
            </>
          )}

          {client && (
            <div className="space-y-1.5">
              <Label htmlFor="report-client">Cliente</Label>
              <ClientPicker
                id="report-client"
                selected={selectedClient}
                onSelect={(client) => {
                  onSelectClient(client);
                  update({ clientId: client.id });
                }}
                onClear={() => {
                  onSelectClient(null);
                  update({ clientId: '' });
                }}
                clearLabel="Todos os clientes"
                {...(disabled ? { disabled } : {})}
              />
            </div>
          )}

          {statuses.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="report-status">
                {report.id === 'finance-receipts' ? 'Forma de recebimento' : 'Situação'}
              </Label>
              <Select
                value={value.status || ALL}
                onValueChange={(next) => update({ status: next === ALL ? '' : next })}
                disabled={disabled}
              >
                <SelectTrigger id="report-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas</SelectItem>
                  {statuses.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Dizer sobre QUAL data o período incide: sem isso, "de 01/09 a
              30/09" é ambíguo — emitidas, vencendo ou pagas em setembro? */}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarRange className="size-3.5" aria-hidden="true" />
            {period
              ? `O período considera: ${report.periodField.toLowerCase()}.`
              : report.periodField}
          </p>

          {hasAny && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onSelectClient(null);
                onChange({});
              }}
              disabled={disabled}
            >
              <X />
              Limpar filtros
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
