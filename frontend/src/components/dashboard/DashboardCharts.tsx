import { ChartCard } from '@/components/dashboard/ChartCard';
import { ContractStatusChart } from '@/components/dashboard/ContractStatusChart';
import { InvoiceStatusChart } from '@/components/dashboard/InvoiceStatusChart';
import { NewClientsChart } from '@/components/dashboard/NewClientsChart';
import { RevenueChart } from '@/components/dashboard/RevenueChart';
import type { DashboardResponse } from '@/types/dashboard';
import { toChartNumber } from '@/utils/format';

interface DashboardChartsProps {
  data: DashboardResponse;
}

/**
 * Os quatro gráficos do painel, agrupados em um único módulo.
 *
 * POR QUE ESTÃO JUNTOS AQUI: este arquivo é a fronteira de carregamento
 * preguiçoso. O Recharts arrasta o D3 junto e responde por cerca de 400 kB do
 * pacote — e a tela de LOGIN não desenha gráfico nenhum. Com este único ponto
 * de `lazy()` no DashboardPage, quem abre o sistema para digitar a senha não
 * baixa a biblioteca inteira de visualização antes de conseguir entrar.
 *
 * Só é renderizado quando `data` existe, então cada gráfico pode assumir que
 * tem dados e não precisa tratar `undefined`.
 */
export default function DashboardCharts({ data }: DashboardChartsProps) {
  const hasNoRevenue = data.charts.monthlyRevenue.every(
    (point) => toChartNumber(point.total) === 0,
  );
  const hasNoNewClients = data.charts.newClientsByMonth.every((point) => point.count === 0);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ChartCard
        title="Receita mensal"
        description="Pagamentos recebidos nos últimos 12 meses"
        isEmpty={hasNoRevenue}
        emptyTitle="Nenhum pagamento nos últimos 12 meses"
        emptyDescription="O gráfico se preenche quando houver pagamentos registrados."
      >
        <RevenueChart data={data.charts.monthlyRevenue} />
      </ChartCard>

      <ChartCard
        title="Faturas por situação"
        description="Distribuição de todas as faturas emitidas"
        isEmpty={data.cards.invoices.total === 0}
        emptyTitle="Nenhuma fatura emitida"
        emptyDescription="As faturas aparecem aqui assim que forem criadas."
        height={320}
      >
        <InvoiceStatusChart data={data.charts.invoicesByStatus} />
      </ChartCard>

      <ChartCard
        title="Novos clientes por mês"
        description="Cadastros realizados nos últimos 12 meses"
        isEmpty={hasNoNewClients}
        emptyTitle="Nenhum cadastro nos últimos 12 meses"
      >
        <NewClientsChart data={data.charts.newClientsByMonth} />
      </ChartCard>

      <ChartCard
        title="Contratos por situação"
        description="Situação atual da carteira de contratos"
        isEmpty={data.cards.contracts.total === 0}
        emptyTitle="Nenhum contrato cadastrado"
      >
        <ContractStatusChart data={data.charts.contractsByStatus} />
      </ChartCard>
    </div>
  );
}
