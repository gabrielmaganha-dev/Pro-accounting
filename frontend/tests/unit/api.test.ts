import { describe, expect, it, vi } from 'vitest';

import { apiRequest, ApiError, UNAUTHORIZED_EVENT } from '@/services/api';
import { tokenStorage } from '@/utils/storage';

import { fail, mockApi, ok } from '../utils/server';

describe('cliente HTTP (apiRequest)', () => {
  it('desembrulha o envelope { success, data }', async () => {
    mockApi({ 'GET /clients': ok({ items: [1, 2] }) });

    await expect(apiRequest('/clients')).resolves.toEqual({ items: [1, 2] });
  });

  it('anexa o token salvo e serializa o corpo como JSON', async () => {
    tokenStorage.set('token-abc');
    const { requests } = mockApi({ 'POST /clients': ok({ id: 'c1' }, 201) });

    await apiRequest('/clients', { method: 'POST', body: { name: 'X' } });

    expect(requests[0]?.headers.Authorization).toBe('Bearer token-abc');
    expect(requests[0]?.headers['Content-Type']).toBe('application/json');
    expect(requests[0]?.body).toEqual({ name: 'X' });
  });

  it('rota pública não envia o token', async () => {
    tokenStorage.set('token-abc');
    const { requests } = mockApi({ 'POST /auth/login': ok({}) });

    await apiRequest('/auth/login', { method: 'POST', body: {}, auth: false });

    expect(requests[0]?.headers.Authorization).toBeUndefined();
  });

  it('erro da API vira ApiError com mensagem, código e issues', async () => {
    mockApi({
      'POST /clients': fail(422, 'VALIDATION_ERROR', 'CPF inválido.', [
        { field: 'cpfCnpj', message: 'CPF inválido.' },
      ]),
    });

    const error = await apiRequest('/clients', { method: 'POST', body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'CPF inválido.',
      issues: [{ field: 'cpfCnpj', message: 'CPF inválido.' }],
    });
  });

  it('401 limpa a sessão e avisa a aplicação', async () => {
    tokenStorage.set('token-expirado');
    mockApi({ 'GET /clients': fail(401, 'UNAUTHORIZED', 'Sessão expirada.') });
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);

    await expect(apiRequest('/clients')).rejects.toBeInstanceOf(ApiError);

    expect(tokenStorage.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });

  it('403 NÃO derruba a sessão (é falta de permissão, não token inválido)', async () => {
    tokenStorage.set('token-valido');
    mockApi({ 'GET /finance/overview': fail(403, 'FORBIDDEN', 'Sem permissão.') });

    await expect(apiRequest('/finance/overview')).rejects.toMatchObject({ status: 403 });

    expect(tokenStorage.get()).toBe('token-valido');
  });

  it('rede fora do ar vira mensagem em português', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(apiRequest('/clients')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Não foi possível conectar ao servidor. Verifique se a API está em execução.',
    });
  });

  it('resposta sem JSON (ex.: proxy devolvendo HTML) não quebra o tratamento', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })),
    );

    await expect(apiRequest('/clients')).rejects.toMatchObject({
      status: 502,
      message: 'Erro inesperado ao comunicar com o servidor.',
    });
  });

  it('204 resolve sem corpo', async () => {
    mockApi({ 'DELETE /clients/c1': { status: 204 } });

    await expect(apiRequest('/clients/c1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
