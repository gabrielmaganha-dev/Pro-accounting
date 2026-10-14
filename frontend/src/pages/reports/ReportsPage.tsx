import { BarChart3, Inbox } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { SummaryTile } from '@/components/common/SummaryTile';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import { ExportMenu } from '@/components/reports/ExportMenu';
import { ReportFilters } from '@/components/reports/ReportFilters';
import { ReportPicker } from '@/components/reports/ReportPicker';
import { ReportTable } from '@/components/reports/ReportTable';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDownloadReport, useReportCatalog, useReportData } from '@/hooks/use-reports';
import type { ClientSummary } from '@/types/client';
import type { ReportFilters as Filters, ReportFormat } from '@/types/report';

const PAGE_SIZE = 20;

/**
 * Tela de relatórios.
 *
 * A página não conhece nenhum relatório. Ela lê o catálogo do backend, desenha
 * os filtros que o relatório escolhido declara aceitar e monta a tabela a
 * partir das colunas que vieram junto com os dados. Acrescentar um relatório
 * no servidor o faz aparecer aqui sem alteração nenhuma neste arquivo — que é
 * o objetivo da arquitetura montada na etapa.
 */
export function ReportsPage() {
  /**
   * Relatório e filtros vivem na URL.
   *
   * Assim o botão Voltar funciona e um recorte pode ser mandado por link a um
   * colega — que é o pedido mais frequente sobre relatório: "me manda esse
   * mesmo, do mês passado".
   */
  const [searchParams, setSearchParams] = useSearchParams();

  const catalog = useReportCatalog();

  const selectedId = searchParams.get('r') ?? undefined;
  const page = Number(searchParams.get('page') ?? '1');

  const filters: Filters = useMemo(() => {
    const value: Filters = {};
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');

    if (from) value.from = from;
    if (to) value.to = to;
    if (clientId) value.clientId = clientId;
    if (status) value.status = status;

    return value;
  }, [searchParams]);

  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(null);

  const report = catalog.data?.find((item) => item.id === selectedId);

  // Seleciona o primeiro relatório assim que o catálogo chega, para a tela não
  // abrir vazia sem explicação.
  useEffect(() => {
    if (selectedId || !catalog.data || catalog.data.length === 0) return;

    const next = new URLSearchParams(searchParams);
    next.set('r', catalog.data[0]?.id ?? '');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.data, selectedId]);

  function selectReport(id: string): void {
    // Troca de relatório zera os filtros: as situações aceitas por um não são
    // as do outro, e um `status=PIX` herdado devolveria vazio sem explicação.
    setSelectedClient(null);
    setSearchParams(new URLSearchParams({ r: id }), { replace: false });
  }

  function applyFilters(next: Filters): void {
    const params = new URLSearchParams();
    if (selectedId) params.set('r', selectedId);

    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, String(value));
    }

    setSearchParams(params, { replace: true });
  }

  function goToPage(next: number): void {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(next));
    setSearchParams(params, { replace: true });
  }

  const data = useReportData(selectedId, filters, page, PAGE_SIZE);
  const download = useDownloadReport();

  function handleExport(format: ReportFormat): void {
    if (!selectedId) return;
    download.mutate({ id: selectedId, format, filters });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Relatórios
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha um relatório, ajuste o recorte e exporte em CSV, Excel ou PDF.
        </p>
      </div>

      {/* ---------------- Catálogo ---------------- */}
      {catalog.isPending ? (
        <CatalogSkeleton />
      ) : catalog.isError && !catalog.data ? (
        <Card>
          <ErrorState
            title="Não foi possível carregar os relatórios"
            description={catalog.error instanceof Error ? catalog.error.message : undefined}
            onRetry={() => void catalog.refetch()}
            isRetrying={catalog.isFetching}
          />
        </Card>
      ) : (
        <ReportPicker
          reports={catalog.data ?? []}
          selectedId={selectedId}
          onSelect={selectReport}
        />
      )}

      {report && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-5">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{report.title}</h3>
              {/* O subtítulo vem do servidor e descreve o recorte aplicado —
                  o mesmo texto que é impresso no topo do arquivo exportado. */}
              <p className="mt-0.5 text-sm text-muted-foreground">
                {data.data?.subtitle ?? report.description}
              </p>
              {/* No celular o catálogo mostra só os títulos; a descrição do
                  relatório escolhido desce para cá em vez de se perder. Só
                  quando a linha de cima já é o subtítulo do recorte — antes
                  disso ela própria mostra a descrição, e sairiam duas iguais. */}
              {data.data?.subtitle && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:hidden">
                  {report.description}
                </p>
              )}
            </div>

            <ExportMenu
              onExport={handleExport}
              isPending={download.isPending}
              disabled={data.isPending || !data.data}
              total={data.data?.total ?? 0}
            />
          </div>

          <ReportFilters
            report={report}
            value={filters}
            onChange={applyFilters}
            selectedClient={selectedClient}
            onSelectClient={setSelectedClient}
            disabled={data.isFetching}
          />

          {/* ---------------- Resumo ---------------- */}
          {data.data && data.data.summary.length > 0 && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {data.data.summary.map((item) => (
                <SummaryTile
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  hint={item.hint}
                />
              ))}
            </div>
          )}

          {/* ---------------- Tabela ---------------- */}
          <Card className="overflow-hidden">
            {data.isError && !data.data ? (
              <ErrorState
                title="Não foi possível carregar o relatório"
                description={data.error instanceof Error ? data.error.message : undefined}
                onRetry={() => void data.refetch()}
                isRetrying={data.isFetching}
              />
            ) : data.isPending ? (
              <TableSkeleton />
            ) : data.data && data.data.rows.length === 0 ? (
              <EmptyState
                title="Nenhum registro no recorte atual"
                description="Ajuste o período, o cliente ou a situação — ou limpe os filtros para ver tudo."
                icon={Inbox}
              />
            ) : (
              <>
                <ReportTable
                  columns={data.data?.report.columns ?? report.columns}
                  rows={data.data?.rows ?? []}
                />

                {data.data && (
                  <Pagination
                    page={data.data.page}
                    pageSize={data.data.pageSize}
                    total={data.data.total}
                    totalPages={data.data.totalPages}
                    onPageChange={goToPage}
                    disabled={data.isFetching}
                  />
                )}
              </>
            )}
          </Card>
        </>
      )}

      {!report && !catalog.isPending && !catalog.isError && (
        <Card>
          <EmptyState
            title="Escolha um relatório"
            description="Selecione um dos relatórios acima para ver os dados e exportar."
            icon={BarChart3}
          />
        </Card>
      )}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 2 }).map((_, group) => (
        <div key={group}>
          <Skeleton className="mb-2 h-5 w-32" />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, card) => (
              <Skeleton key={card} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
