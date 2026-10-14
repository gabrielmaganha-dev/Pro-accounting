import { apiRequest } from '@/services/api';
import { buildQuery, downloadFile } from '@/services/download';
import type {
  ExportFormat,
  FinanceEntriesPage,
  FinanceFilters,
  FinanceOverview,
} from '@/types/finance';

export async function getFinanceOverview(
  filters: FinanceFilters,
  signal?: AbortSignal,
): Promise<FinanceOverview> {
  return apiRequest<FinanceOverview>(
    `/finance/overview${buildQuery(filters)}`,
    signal ? { signal } : {},
  );
}

export async function getFinanceEntries(
  filters: FinanceFilters,
  signal?: AbortSignal,
): Promise<FinanceEntriesPage> {
  return apiRequest<FinanceEntriesPage>(
    `/finance/entries${buildQuery(filters)}`,
    signal ? { signal } : {},
  );
}

/**
 * Baixa a exportação do financeiro.
 *
 * A mecânica do download vive em `services/download.ts`, compartilhada com o
 * módulo de relatórios — os dois baixam arquivo autenticado e nomeiam pelo
 * `Content-Disposition`, então não há motivo para duas implementações.
 */
export async function downloadFinanceExport(
  filters: FinanceFilters & { format: ExportFormat },
): Promise<void> {
  await downloadFile(
    `/finance/export${buildQuery(filters)}`,
    `financeiro.${filters.format}`,
  );
}
