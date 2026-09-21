import { env } from '@/lib/env';
import { ApiError, apiRequest } from '@/services/api';
import type {
  ExportFormat,
  FinanceEntriesPage,
  FinanceFilters,
  FinanceOverview,
} from '@/types/finance';
import { tokenStorage } from '@/utils/storage';

function buildQuery(filters: object): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text.length === 0) continue;
    params.set(key, text);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

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
 * Baixa a exportação.
 *
 * Não passa por `apiRequest` porque esta rota devolve o ARQUIVO cru, não o
 * envelope `{ success, data }` — e porque o download precisa de um Blob, não
 * de JSON. O tratamento de erro é refeito aqui, em miniatura, para que uma
 * recusa (formato indisponível, período grande demais) continue chegando à
 * tela como `ApiError` com a mensagem da API, igual ao resto do sistema.
 */
export async function downloadFinanceExport(
  filters: FinanceFilters & { format: ExportFormat },
): Promise<void> {
  const token = tokenStorage.get();

  const response = await fetch(`${env.apiUrl}/finance/export${buildQuery(filters)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    // A recusa vem em JSON mesmo nesta rota — só o sucesso é arquivo.
    let message = 'Não foi possível gerar a exportação.';
    let code: 'NOT_IMPLEMENTED' | 'INTERNAL_ERROR' = 'INTERNAL_ERROR';

    try {
      const payload = (await response.json()) as {
        error?: { message?: string; code?: string };
      };
      if (payload.error?.message) message = payload.error.message;
      if (payload.error?.code === 'NOT_IMPLEMENTED') code = 'NOT_IMPLEMENTED';
    } catch {
      // Resposta sem corpo JSON: mantém a mensagem padrão.
    }

    throw new ApiError(message, response.status, code);
  }

  const blob = await response.blob();

  /**
   * O nome do arquivo vem do `Content-Disposition`, montado pelo servidor com
   * as datas do período. Reconstruí-lo aqui duplicaria a lógica de período no
   * frontend — exatamente o que este módulo evita.
   */
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? 'financeiro.csv';

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Sem o revoke, cada exportação deixaria o arquivo inteiro preso em memória
  // até a aba ser fechada.
  URL.revokeObjectURL(url);
}
