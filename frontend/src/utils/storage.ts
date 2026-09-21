const TOKEN_KEY = 'pro-accounting:token';

/**
 * Guarda o token JWT.
 *
 * DECISÃO CONSCIENTE (e provisória): o token fica no localStorage.
 *
 *  • Vantagem: sobrevive ao recarregar a página, funciona com a API em outra
 *    porta e não exige configuração de cookie entre origens diferentes.
 *  • Risco: localStorage é legível por JavaScript, então uma falha de XSS
 *    permitiria roubar o token. Um cookie httpOnly não teria esse problema.
 *
 * A troca está planejada para a etapa de autenticação completa (refresh token
 * com rotação em cookie httpOnly + SameSite). Todo o acesso ao token passa por
 * este módulo justamente para que essa troca seja local: nenhuma tela lê
 * localStorage diretamente.
 *
 * Todo acesso é protegido por try/catch: em janela anônima ou com cookies de
 * site bloqueados, o simples ato de LER localStorage lança exceção.
 */
export const tokenStorage = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  set(token: string): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Sessão segue válida em memória até o usuário fechar a aba.
    }
  },

  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nada a fazer — o token já não será reutilizado.
    }
  },
};
