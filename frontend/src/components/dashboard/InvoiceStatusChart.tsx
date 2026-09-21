import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { ChartTooltip } from '@/components/dashboard/ChartTooltip';
import { INVOICE_STATUS_COLORS } from '@/lib/chart-theme';
import type { InvoiceStatusSlice } from '@/types/dashboard';
import { formatCurrency } from '@/utils/format';

interface InvoiceStatusChartProps {
  data: InvoiceStatusSlice[];
}

/**
 * Faturas por status.
 *
 * Rosca porque a pergunta é de composição ("quanto do total está atrasado?")
 * e são apenas quatro partes.
 *
 * DUAS DECISÕES DE ACESSIBILIDADE, não cosméticas:
 *
 *  1. Cada fatia é rotulada com o número na legenda abaixo. A separação entre
 *     o âmbar de "pendente" e o verde de "paga" fica em ΔE 7.9 sob
 *     protanopia — insuficiente para distinguir só pela cor. Com o número
 *     escrito, quem não separa os matizes ainda lê o gráfico.
 *  2. `paddingAngle` cria 2px de respiro entre as fatias, para a fronteira
 *     entre duas cores próximas não sumir.
 *
 * O tooltip mostra valor de face E saldo em aberto quando eles divergem — é o
 * caso das faturas com pagamento parcial, em que o card do topo (que usa o
 * saldo) mostraria um número diferente sem explicação.
 */
export function InvoiceStatusChart({ data }: InvoiceStatusChartProps) {
  // Fatias zeradas são removidas do desenho, mas permanecem na legenda: a
  // ausência ("nenhuma fatura cancelada") é informação relevante.
  const slices = data.filter((slice) => slice.count > 0);
  const total = data.reduce((sum, slice) => sum + slice.count, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={2}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.status} fill={INVOICE_STATUS_COLORS[slice.status]} />
              ))}
            </Pie>

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;

                const slice = payload[0]?.payload as InvoiceStatusSlice | undefined;
                if (!slice) return null;

                const rows = [
                  {
                    label: 'Faturas',
                    value: String(slice.count),
                    color: INVOICE_STATUS_COLORS[slice.status],
                  },
                  { label: 'Valor emitido', value: formatCurrency(slice.amount) },
                ];

                if (slice.outstanding !== slice.amount) {
                  rows.push({ label: 'Em aberto', value: formatCurrency(slice.outstanding) });
                }

                return <ChartTooltip title={slice.label} rows={rows} />;
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Total no centro da rosca: o número que responde "de quantas
            faturas estamos falando" sem precisar somar as fatias no olho. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-foreground">{total}</span>
          <span className="text-xs text-muted-foreground">
            {total === 1 ? 'fatura' : 'faturas'}
          </span>
        </div>
      </div>

      {/* Legenda com rótulo direto — a codificação secundária que torna o
          gráfico legível para quem não distingue âmbar de verde. */}
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
        {data.map((slice) => (
          <li key={slice.status} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: INVOICE_STATUS_COLORS[slice.status] }}
            />
            <span className="truncate text-muted-foreground">{slice.label}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
