import { env } from '@/lib/env';
import { ApiError } from '@/services/api';
import type { ApiErrorCode } from '@/types/api';
import { tokenStorage } from '@/utils/storage';

/**
 * Download autenticado de arquivo.
 *
 * Não passa por `apiRequest` porque as rotas de exportação devolvem o ARQUIVO
 * cru, não o envelope `{ success, data }` — e porque o navegador precisa de um
 * Blob, não de JSON.
 *
 * Fica separado e compartilhado entre o módulo financeiro e o de relatórios: a
 * mecânica de criar um link temporário, clicar nele e liberar a memória é
 * idêntica nos dois, e duplicá-la garantiria que um dos dois esquecesse o
 * `revokeObjectURL` — o vazamento que só aparece depois da vigésima exportação.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const file = await fetchFile(path, fallbackName);
  saveBlob(file.blob, file.filename);
}

export interface FetchedFile {
  blob: Blob;
  filename: string;
}

/**
 * Busca um arquivo autenticado sem salvá-lo — para quem precisa exibir ou
 * imprimir o conteúdo, como a fatura em PDF.
 */
export async function fetchFile(path: string, fallbackName: string): Promise<FetchedFile> {
  const token = tokenStorage.get();

  const response = await fetch(`${env.apiUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    // A recusa vem em JSON mesmo nestas rotas — só o sucesso é arquivo.
    let message = 'Não foi possível gerar o arquivo.';
    let code: ApiErrorCode = 'INTERNAL_ERROR';

    try {
      const payload = (await response.json()) as {
        error?: { message?: string; code?: ApiErrorCode };
      };
      if (payload.error?.message) message = payload.error.message;
      if (payload.error?.code) code = payload.error.code;
    } catch {
      // Resposta sem corpo JSON: mantém a mensagem padrão.
    }

    throw new ApiError(message, response.status, code);
  }

  const blob = await response.blob();

  /**
   * O nome vem do `Content-Disposition` montado pelo servidor, com o nome do
   * relatório e a data. Reconstruí-lo aqui duplicaria no navegador uma decisão
   * que já foi tomada no servidor — e as duas versões divergiriam.
   */
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);

  return { blob, filename: match?.[1] ?? fallbackName };
}

/** Salva um arquivo já em memória com o nome dado. */
export function saveBlob(blob: Blob, filename: string): void {
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

/** Monta a query string ignorando filtros vazios. */
export function buildQuery(filters: object): string {
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
