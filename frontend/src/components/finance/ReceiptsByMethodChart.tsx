import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartTooltip } from '@/components/dashboard/ChartTooltip';
import {
  AXIS_COLOR,
  BAR_RADIUS_HORIZONTAL,
  GRID_COLOR,
  SERIES_COLORS,
  TICK_STYLE,
} from '@/lib/chart-theme';
import type { MethodSlice } from '@/types/finance';
import { formatCurrency, formatCurrencyCompact, toChartNumber } from '@/utils/format';

interface ReceiptsByMethodChartProps {
  data: MethodSlice[];
  total: string;
}

/**
 * Recebimentos por forma de pagamento.
 *
 * ---------------------------------------------------------------------------
 * POR QUE BARRAS HORIZONTAIS DE UM MATIZ SÓ, E NÃO UMA ROSCA COLORIDA
 * ---------------------------------------------------------------------------
 * São seis categorias. Uma rosca exigiria seis cores categóricas distinguíveis
 * entre si — inclusive para quem tem daltonismo — e a paleta validada deste
 * projeto tem cinco cores de STATUS, que são reservadas (verde = pago, vermelho
 * = atrasado) e não podem virar "série 4" sem passar a mentir sobre o
 * significado. Inventar seis cores novas exigiria revalidar a paleta inteira.
 *
 * A barra horizontal resolve o problema em vez de contorná-lo: o nome da forma
 * fica no eixo, escrito. A identidade não depende de cor nenhuma, então um
 * matiz só basta — e a comparação de comprimento é mais precisa que a de
 * ângulo, que é a fraqueza conhecida da rosca.
 *
 * Ordenado do maior para o menor: a pergunta é "por onde entra o dinheiro", e
 * a resposta deve estar na primeira linha.
 */
export function ReceiptsByMethodChart({ data, total }: ReceiptsByMethodChartProps) {
  const totalNumber = toChartNumber(total);

  const chartData = [...data]
    .sort((a, b) => toChartNumber(b.total) - toChartNumber(a.total))
    .map((slice) => ({
      label: slice.label,
      value: toChartNumber(slice.total),
      count: slice.count,
      share: totalNumber > 0 ? (toChartNumber(slice.total) / totalNumber) * 100 : 0,
    }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 4, right: 56, bottom: 0, left: 8 }}
        barCategoryGap={10}
      >
        {/* Grade só vertical: em barras horizontais é ela que ajuda a comparar
            comprimentos. Linhas horizontais aqui seriam ruído. */}
        <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" horizontal={false} />

        <XAxis
          type="number"
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={{ stroke: GRID_COLOR }}
          stroke={AXIS_COLOR}
          tickFormatter={(value: number) => formatCurrencyCompact(value)}
        />

        <YAxis
          type="category"
          dataKey="label"
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          stroke={AXIS_COLOR}
          width={96}
        />

        <Tooltip
          cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;

            const point = payload[0]?.payload as
              | { label: string; value: number; count: number; share: number }
              | undefined;
            if (!point) return null;

            return (
              <ChartTooltip
                title={point.label}
                rows={[
                  {
                    label: 'Recebido',
                    value: formatCurrency(point.value),
                    color: SERIES_COLORS.revenue,
                  },
                  { label: 'Participação', value: `${point.share.toFixed(1)}%` },
                  { label: 'Lançamentos', value: String(point.count) },
                ]}
              />
            );
          }}
        />

        <Bar dataKey="value" radius={BAR_RADIUS_HORIZONTAL} maxBarSize={28}>
          {chartData.map((point) => (
            <Cell key={point.label} fill={SERIES_COLORS.revenue} />
          ))}

          {/* Rótulo direto no fim da barra: com poucas categorias ele cabe, e
              evita que o usuário tenha que mirar no eixo para ler o valor. */}
          <LabelList
            dataKey="value"
            position="right"
            // O Recharts tipa o rótulo como texto renderizável, que pode vir
            // indefinido; `formatCurrencyCompact` já trata nulo devolvendo R$ 0,00.
            formatter={(value: unknown) => formatCurrencyCompact(value as number)}
            style={{ fontSize: 12, fill: '#475569' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
