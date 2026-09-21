import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
  WifiOff,
} from 'lucide-react';
import { Suspense, lazy, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { ChartsSkeleton } from '@/components/dashboard/ChartsSkeleton';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { StatCard } from '@/components/dashboard/StatCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { useDashboard } from '@/hooks/use-dashboard';
import { ApiError } from '@/services/api';
import { formatCurrency } from '@/utils/format';

/**
 * Gráficos carregados sob demanda.
 *
 * O Recharts (com o D3 junto) responde por cerca de 400 kB do pacote. Sem esta
 * fronteira, a tela de login — que não desenha gráfico nenhum — obrigaria o
 * usuário a baixar a biblioteca inteira antes de conseguir digitar a senha.
 */
const DashboardCharts = lazy(() => import('@/components/dashboard/DashboardCharts'));

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isPending, isError, error, refetch, isFetching } = useDashboard();

  // Um toast por falha, não um por re-render. Sem esta trava, o TanStack Query
  // re-renderizando por qualquer motivo empilharia toasts idênticos na tela.
  const notifiedErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isError) {
      notifiedErrorRef.current = null;
      return;
    }

    const message =
      error instanceof ApiError ? error.message : 'Não foi possível carregar o painel.';

    if (notifiedErrorRef.current !== message) {
      notifiedErrorRef.current = message;
      toast.error(message);
    }
  }, [isError, error]);

  const firstName = user?.name.split(' ')[0] ?? '';
  const cards = data?.cards;

  const updatedAt = data
    ? new Date(data.generatedAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Um escritório recém-instalado não tem nada cadastrado. Nesse caso o painel
  // inteiro seria zeros e gráficos vazios, o que parece defeito — então a tela
  // explica o que fazer em vez de exibir um vazio mudo.
  const isBrandNew =
    data !== undefined &&
    cards !== undefined &&
    cards.clients.total === 0 &&
    cards.contracts.total === 0 &&
    cards.invoices.total === 0;

  if (isError) {
    return (
      <div className="space-y-6">
        <PageHeader firstName={firstName} updatedAt={null} onRefresh={refetch} isFetching={isFetching} />

        <Alert variant="destructive">
          <WifiOff />
          <AlertTitle>Não foi possível carregar o painel</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {error instanceof ApiError
                ? error.message
                : 'Ocorreu um erro inesperado ao consultar o servidor.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        firstName={firstName}
        updatedAt={updatedAt}
        onRefresh={refetch}
        isFetching={isFetching}
      />

      {isBrandNew && (
        <Alert variant="info">
          <CheckCircle2 />
          <AlertTitle>Sistema pronto, sem dados ainda</AlertTitle>
          <AlertDescription>
            O painel está conectado ao banco, mas não há clientes cadastrados. Os números e
            gráficos abaixo se preenchem sozinhos conforme clientes, contratos e faturas forem
            lançados.
          </AlertDescription>
        </Alert>
      )}

      {/* ---------------------------------------------------------------
          Financeiro primeiro: é a pergunta que traz o usuário ao painel.
          --------------------------------------------------------------- */}
      <section aria-labelledby="secao-financeiro" className="space-y-3">
        <h3 id="secao-financeiro" className="text-sm font-semibold text-muted-foreground">
          Financeiro
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Total recebido"
            value={formatCurrency(cards?.amounts.received)}
            hint="Soma dos pagamentos registrados"
            icon={TrendingUp}
            tone="success"
            isLoading={isPending}
          />
          <StatCard
            label="Total pendente"
            value={formatCurrency(cards?.amounts.pending)}
            hint={`${cards?.invoices.pending ?? 0} fatura(s) dentro do prazo`}
            icon={Clock}
            tone="warning"
            isLoading={isPending}
          />
          <StatCard
            label="Total atrasado"
            value={formatCurrency(cards?.amounts.overdue)}
            hint={`${cards?.invoices.overdue ?? 0} fatura(s) vencida(s)`}
            icon={AlertTriangle}
            tone="danger"
            isLoading={isPending}
          />
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      <section aria-labelledby="secao-carteira" className="space-y-3">
        <h3 id="secao-carteira" className="text-sm font-semibold text-muted-foreground">
          Clientes e contratos
        </h3>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            label="Total de clientes"
            value={String(cards?.clients.total ?? 0)}
            icon={Users}
            tone="brand"
            isLoading={isPending}
          />
          <StatCard
            label="Clientes ativos"
            value={String(cards?.clients.active ?? 0)}
            icon={UserCheck}
            tone="success"
            isLoading={isPending}
          />
          <StatCard
            label="Clientes inativos"
            value={String(cards?.clients.inactive ?? 0)}
            icon={UserMinus}
            tone="neutral"
            isLoading={isPending}
          />
          <StatCard
            label="Contratos ativos"
            value={String(cards?.contracts.active ?? 0)}
            icon={FileText}
            tone="success"
            isLoading={isPending}
          />
          <StatCard
            label="Contratos vencendo"
            value={String(cards?.contracts.expiringSoon ?? 0)}
            hint="Nos próximos 30 dias"
            icon={CalendarClock}
            tone="warning"
            isLoading={isPending}
          />
        </div>
      </section>

      {/* --------------------------------------------------------------- */}
      <section aria-labelledby="secao-faturas" className="space-y-3">
        <h3 id="secao-faturas" className="text-sm font-semibold text-muted-foreground">
          Faturas
        </h3>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total de faturas"
            value={String(cards?.invoices.total ?? 0)}
            icon={ReceiptText}
            tone="brand"
            isLoading={isPending}
          />
          <StatCard
            label="Pagas"
            value={String(cards?.invoices.paid ?? 0)}
            icon={CheckCircle2}
            tone="success"
            isLoading={isPending}
          />
          <StatCard
            label="Pendentes"
            value={String(cards?.invoices.pending ?? 0)}
            icon={Clock}
            tone="warning"
            isLoading={isPending}
          />
          <StatCard
            label="Atrasadas"
            value={String(cards?.invoices.overdue ?? 0)}
            icon={AlertTriangle}
            tone="danger"
            isLoading={isPending}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Gráficos
          --------------------------------------------------------------- */}
      {isPending || !data ? (
        <ChartsSkeleton />
      ) : (
        <Suspense fallback={<ChartsSkeleton />}>
          <DashboardCharts data={data} />
        </Suspense>
      )}

      {/* ---------------------------------------------------------------
          Alertas e atividade
          --------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AlertsPanel alerts={data?.alerts} isLoading={isPending} />
        <RecentActivity activity={data?.recentActivity} isLoading={isPending} />
      </div>
    </div>
  );
}

interface PageHeaderProps {
  firstName: string;
  updatedAt: string | null;
  onRefresh: () => void;
  isFetching: boolean;
}

function PageHeader({ firstName, updatedAt, onRefresh, isFetching }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Olá, {firstName}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Panorama dos clientes, contratos e faturas do escritório.
          {updatedAt && <span className="ml-1">Atualizado às {updatedAt}.</span>}
        </p>
      </div>

      <Button variant="outline" size="sm" onClick={onRefresh} disabled={isFetching}>
        <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
        {isFetching ? 'Atualizando…' : 'Atualizar'}
      </Button>
    </div>
  );
}
