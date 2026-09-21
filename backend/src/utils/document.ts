/**
 * Validação de CPF e CNPJ.
 *
 * Conferir o dígito verificador, e não apenas a quantidade de caracteres, é o
 * que impede "11111111111" ou um número digitado errado de entrar no cadastro.
 * Num escritório contábil isso importa de verdade: CPF/CNPJ errado vai parar
 * em guia de recolhimento e declaração acessória, e o erro só aparece meses
 * depois, já com multa.
 */

/** Remove tudo que não for dígito. É assim que o documento é gravado no banco. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Calcula um dígito verificador pelo módulo 11.
 *
 * Tanto o CPF quanto o CNPJ usam o mesmo algoritmo; muda apenas a sequência de
 * pesos aplicada a cada posição.
 */
function modulo11CheckDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((total, weight, index) => {
    return total + Number(digits[index] ?? 0) * weight;
  }, 0);

  const remainder = sum % 11;

  // Resto 0 ou 1 resulta em dígito 0 — é a regra da Receita Federal.
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11) return false;

  // Sequências repetidas (000.000.000-00, 111.111.111-11 ...) passam no cálculo
  // do dígito verificador, mas não são documentos válidos.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const firstDigit = modulo11CheckDigit(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (firstDigit !== Number(cpf[9])) return false;

  const secondDigit = modulo11CheckDigit(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return secondDigit === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);

  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const firstDigit = modulo11CheckDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (firstDigit !== Number(cnpj[12])) return false;

  const secondDigit = modulo11CheckDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return secondDigit === Number(cnpj[13]);
}

/** Aceita CPF (11 dígitos) ou CNPJ (14 dígitos). */
export function isValidCpfCnpj(value: string): boolean {
  const digits = onlyDigits(value);

  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);

  return false;
}

/** Unidades da Federação, para validar o campo `state`. */
export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export type BrazilianState = (typeof BRAZILIAN_STATES)[number];

export function isValidState(value: string): boolean {
  return (BRAZILIAN_STATES as readonly string[]).includes(value.toUpperCase());
}
