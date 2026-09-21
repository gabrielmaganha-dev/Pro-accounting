import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ChartTooltip } from '@/components/dashboard/ChartTooltip';
import { AXIS_COLOR, BAR_RADIUS, GRID_COLOR, SERIES_COLORS, TICK_STYLE } from '@/lib/chart-theme';
import type { NewClientsPoint } from '@/types/dashboard';

interface NewClientsChartProps {
  data: NewClientsPoint[];
}

/**
 * Clientes cadastrados por mês.
 *
 * Matiz diferente do gráfico de receita (verde-azulado, ΔE 22.6 do azul) por
 * uma razão de leitura: são entidades diferentes. Usar o mesmo azul sugeriria
 * que as duas séries medem a mesma coisa.
 */
export function NewClientsChart({ data }: NewClientsChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />

        <XAxis
          dataKey="label"
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          stroke={AXIS_COLOR}
          interval="preserveStartEnd"
          minTickGap={8}
        />

        <YAxis
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          stroke={AXIS_COLOR}
          width={32}
          // Quantidade de clientes é inteiro: um eixo com "1,5 cliente" seria
          // absurdo, então os ticks são forçados a números inteiros.
          allowDecimals={false}
        />

        <Tooltip
          cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;

            const count = Number(payload[0]?.value ?? 0);

            return (
              <ChartTooltip
                title={String(label)}
                rows={[
                  {
                    label: count === 1 ? 'Novo cliente' : 'Novos clientes',
                    value: String(count),
                    color: SERIES_COLORS.clients,
                  },
                ]}
              />
            );
          }}
        />

        <Bar
          dataKey="count"
          fill={SERIES_COLORS.clients}
          radius={BAR_RADIUS}
          maxBarSize={44}
          name="Novos clientes"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
