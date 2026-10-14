import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/services/api';
import { downloadReport, listReports, runReport } from '@/services/report.service';
import {
  REPORT_FORMAT_LABELS,
  type ReportFilters,
  type ReportFormat,
} from '@/types/report';

export const reportKeys = {
  all: ['reports'] as const,
  catalog: () => [...reportKeys.all, 'catalog'] as const,
  run: (id: string, filters: ReportFilters, page: number) =>
    [...reportKeys.all, 'run', id, filters, page] as const,
};

/**
 * Catálogo de relatórios.
 *
 * `staleTime` alto de propósito: o catálogo só muda quando alguém acrescenta um
 * relatório ao código, então revalidá-lo a cada foco de janela seria uma
 * requisição por nada. O conteúdo depende do perfil, mas o cache do TanStack é
 * limpo no logout — logo, a troca de usuário não reaproveita o catálogo errado.
 */
export function useReportCatalog() {
  return useQuery({
    queryKey: reportKeys.catalog(),
    queryFn: ({ signal }) => listReports(signal),
    staleTime: 10 * 60 * 1000,
  });
}

export function useReportData(
  id: string | undefined,
  filters: ReportFilters,
  page: number,
  pageSize = 20,
) {
  return useQuery({
    queryKey: reportKeys.run(id ?? '', filters, page),
    queryFn: ({ signal }) => runReport(id as string, filters, page, pageSize, signal),
    enabled: Boolean(id),
    // Mantém a tabela anterior visível ao trocar de filtro ou de página, em vez
    // de piscar esqueleto a cada clique.
    placeholderData: (previous) => previous,
  });
}

/**
 * Exportação.
 *
 * O toast de sucesso é curto porque o próprio download já é a confirmação
 * visível. O de erro carrega a mensagem da API — que aqui costuma ser
 * acionável ("estreite o período"), e não um "falhou" genérico.
 */
export function useDownloadReport() {
  return useMutation({
    mutationFn: ({
      id,
      format,
      filters,
    }: {
      id: string;
      format: ReportFormat;
      filters: ReportFilters;
    }) => downloadReport(id, format, filters),
    onSuccess: (_data, variables) => {
      toast.success(`Arquivo ${REPORT_FORMAT_LABELS[variables.format]} gerado.`);
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : 'Não foi possível gerar o arquivo.',
      );
    },
  });
}
