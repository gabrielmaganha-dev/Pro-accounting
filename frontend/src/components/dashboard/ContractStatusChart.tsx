import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ChartTooltip } from '@/components/dashboard/ChartTooltip';
import { BAR_RADIUS_HORIZONTAL, CONTRACT_STATUS_COLORS, TICK_STYLE } from '@/lib/chart-theme';
import type { ContractStatusSlice } from '@/types/dashboard';

interface ContractStatusChartProps {
  data: ContractStatusSlice[];
}

/**
 * Contratos por status.
 *
 * Barras horizontais, e não rosca, por dois motivos concretos:
 *
 *  • São cinco status, e vários costumam estar zerados. Uma rosca com fatias
 *    de tamanho zero não consegue representar o zero — o status simplesmente
 *    desaparece, e "não há contratos cancelados" vira indistinguível de
 *    "esqueci de incluir cancelados".
 *  • Os rótulos são longos ("Em renovação"). Na horizontal eles cabem à
 *    esquerda, sem rotacionar texto.
 *
 * O número aparece escrito no fim de cada barra, então a leitura não depende
 * nem de comparar comprimentos nem de distinguir as cores.
 */
export function ContractStatusChart({ data }: ContractStatusChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 32, bottom: 4, left: 0 }}
        barCategoryGap={10}
      >
        <XAxis type="number" hide allowDecimals={false} />

        <YAxis
          type="category"
          dataKey="label"
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          width={96}
        />

        <Tooltip
          cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;

            const slice = payload[0]?.payload as ContractStatusSlice | undefined;
            if (!slice) return null;

            return (
              <ChartTooltip
                title={slice.label}
                rows={[
                  {
                    label: slice.count === 1 ? 'Contrato' : 'Contratos',
                    value: String(slice.count),
                    color: CONTRACT_STATUS_COLORS[slice.status],
                  },
                ]}
              />
            );
          }}
        />

        <Bar dataKey="count" radius={BAR_RADIUS_HORIZONTAL} maxBarSize={28}>
          {data.map((slice) => (
            <Cell key={slice.status} fill={CONTRACT_STATUS_COLORS[slice.status]} />
          ))}

          <LabelList
            dataKey="count"
            position="right"
            className="fill-foreground text-xs font-medium tabular-nums"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
