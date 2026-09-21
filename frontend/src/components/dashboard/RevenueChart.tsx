import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ChartTooltip } from '@/components/dashboard/ChartTooltip';
import { AXIS_COLOR, BAR_RADIUS, GRID_COLOR, SERIES_COLORS, TICK_STYLE } from '@/lib/chart-theme';
import type { MonthlyRevenuePoint } from '@/types/dashboard';
import { formatCurrency, formatCurrencyCompact, toChartNumber } from '@/utils/format';

interface RevenueChartProps {
  data: MonthlyRevenuePoint[];
}

/**
 * Receita mensal dos últimos 12 meses.
 *
 * Barras, não linha: cada mês é um período fechado e independente, e a linha
 * sugeriria uma variação contínua entre meses que não existe.
 *
 * Série única, portanto sem legenda — o título já diz o que está sendo
 * medido, e uma legenda de um item só é ruído.
 */
export function RevenueChart({ data }: RevenueChartProps) {
  const chartData = data.map((point) => ({
    label: point.label,
    value: toChartNumber(point.total),
    paymentCount: point.paymentCount,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        {/* Grade só horizontal: linhas verticais competiriam com as barras
            sem acrescentar informação nenhuma. */}
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />

        <XAxis
          dataKey="label"
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          stroke={AXIS_COLOR}
          // Em telas estreitas o Recharts esconde sozinho os rótulos que
          // colidiriam, mantendo sempre o primeiro e o último.
          interval="preserveStartEnd"
          minTickGap={8}
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

            const point = payload[0]?.payload as
              | { value: number; paymentCount: number }
              | undefined;
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
                  {
                    label: 'Pagamentos',
                    value: String(point.paymentCount),
                  },
                ]}
              />
            );
          }}
        />

        <Bar
          dataKey="value"
          fill={SERIES_COLORS.revenue}
          radius={BAR_RADIUS}
          maxBarSize={44}
          name="Recebido"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
