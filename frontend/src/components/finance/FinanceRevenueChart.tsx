import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ChartTooltip } from '@/components/dashboard/ChartTooltip';
import { AXIS_COLOR, BAR_RADIUS, GRID_COLOR, SERIES_COLORS, TICK_STYLE } from '@/lib/chart-theme';
import type { RevenuePoint } from '@/types/finance';
import { formatCurrency, formatCurrencyCompact, toChartNumber } from '@/utils/format';

interface FinanceRevenueChartProps {
  data: RevenuePoint[];
  /** Definida pelo servidor a partir do tamanho do período. */
  granularity: 'day' | 'month';
}

/**
 * Receita do período.
 *
 * Barras, não linha: cada dia ou mês é um período fechado, e a linha sugeriria
 * uma variação contínua entre eles que não existe — não há "meio caminho" entre
 * o recebimento de segunda e o de terça.
 *
 * Série única, portanto sem legenda: o título já diz o que está sendo medido, e
 * uma legenda de um item só é ruído.
 *
 * A granularidade vem do servidor, não é decidida aqui. É o mesmo cálculo que
 * gerou os rótulos do eixo — se o frontend escolhesse por conta própria, um
 * período de 70 dias poderia render barras diárias com rótulos mensais.
 */
export function FinanceRevenueChart({ data, granularity }: FinanceRevenueChartProps) {
  const chartData = data.map((point) => ({
    label: point.label,
    value: toChartNumber(point.total),
    count: point.count,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />

        <XAxis
          dataKey="label"
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          stroke={AXIS_COLOR}
          // Em telas estreitas o Recharts esconde sozinho os rótulos que
          // colidiriam, mantendo sempre o primeiro e o último. Num período
          // diário longo isso é o que impede o eixo de virar uma mancha.
          interval="preserveStartEnd"
          minTickGap={granularity === 'day' ? 24 : 8}
        />

        <YAxis
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          stroke={AXIS_COLOR}
          width={64}
          tickFormatter={(value: number) => formatCurrencyCompact(value)}
        />

        <Tooltip
          cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;

            const point = payload[0]?.payload as { value: number; count: number } | undefined;
            if (!point) return null;

            return (
              <ChartTooltip
                title={String(label)}
                rows={[
                  {
                    label: 'Recebido',
                    value: formatCurrency(point.value),
                    color: SERIES_COLORS.revenue,
                  },
                  { label: 'Pagamentos', value: String(point.count) },
                ]}
              />
            );
          }}
        />

        <Bar
          dataKey="value"
          fill={SERIES_COLORS.revenue}
          radius={BAR_RADIUS}
          maxBarSize={granularity === 'day' ? 24 : 44}
          name="Recebido"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
