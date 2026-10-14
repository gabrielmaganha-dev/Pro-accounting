/**
 * Política de senha — espelha backend/src/validators/user.validator.ts.
 *
 * Existe do lado do navegador para dar a resposta na hora, enquanto a pessoa
 * digita, em vez de depois de uma ida ao servidor. A validação da API continua
 * sendo a que vale: esta aqui é conveniência, e quem chamar a rota por fora
 * do formulário esbarra na mesma regra.
 *
 * Manter as duas em sincronia é responsabilidade de quem alterar qualquer uma
 * delas — por isso as mensagens são idênticas, o que torna a divergência
 * visível em teste.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Devolve a mensagem de erro, ou `null` se a senha atende à política. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter ao menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Senha longa demais (máximo de ${PASSWORD_MAX_LENGTH} caracteres).`;
  }

  if (!/[a-zA-Z]/.test(password)) {
    return 'A senha precisa ter ao menos uma letra.';
  }

  if (!/\d/.test(password)) {
    return 'A senha precisa ter ao menos um número.';
  }

  return null;
}
