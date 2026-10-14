import { apiRequest } from '@/services/api';
import { buildQuery } from '@/services/download';
import type { AuditFilters, AuditPage } from '@/types/audit';

export async function listAuditLogs(
  filters: AuditFilters,
  signal?: AbortSignal,
): Promise<AuditPage> {
  return apiRequest<AuditPage>(`/audit-logs${buildQuery(filters)}`, signal ? { signal } : {});
}
