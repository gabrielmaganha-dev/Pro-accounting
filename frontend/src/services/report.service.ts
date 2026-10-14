import { apiRequest } from '@/services/api';
import { buildQuery, downloadFile } from '@/services/download';
import type {
  ReportCatalogItem,
  ReportFilters,
  ReportFormat,
  ReportResult,
} from '@/types/report';

export async function listReports(signal?: AbortSignal): Promise<ReportCatalogItem[]> {
  const result = await apiRequest<{ reports: ReportCatalogItem[] }>(
    '/reports',
    signal ? { signal } : {},
  );

  return result.reports;
}

export async function runReport(
  id: string,
  filters: ReportFilters,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<ReportResult> {
  const query = buildQuery({ ...filters, page, pageSize });

  return apiRequest<ReportResult>(`/reports/${id}${query}`, signal ? { signal } : {});
}

export async function downloadReport(
  id: string,
  format: ReportFormat,
  filters: ReportFilters,
): Promise<void> {
  const query = buildQuery({ ...filters, format });

  await downloadFile(`/reports/${id}/export${query}`, `relatorio.${format}`);
}
