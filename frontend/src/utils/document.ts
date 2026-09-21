/**
 * Validação de CPF/CNPJ no navegador.
 *
 * Duplica deliberadamente a lógica de backend/src/utils/document.ts.
 *
 * Não é descuido: são duas validações com propósitos diferentes. A do
 * navegador existe para avisar a pessoa ANTES de ela enviar o formulário, sem
 * ida ao servidor. A do backend é a que vale — qualquer um pode desabilitar o
 * JavaScript, e nenhuma decisão de integridade de dado pode depender do
 * cliente.
 *
 * Se um dia as duas divergirem, o pior caso é o formulário aceitar um
 * documento que a API recusa, e a mensagem da API aparece no campo. O
 * contrário (front recusar o que o back aceitaria) é apenas restritivo.
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function modulo11CheckDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce(
    (total, weight, index) => total + Number(digits[index] ?? 0) * weight,
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  if (modulo11CheckDigit(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]) !== Number(cpf[9])) return false;
  return modulo11CheckDigit(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cpf[10]);
}

export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  if (modulo11CheckDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) !== Number(cnpj[12])) {
    return false;
  }
  return modulo11CheckDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(cnpj[13]);
}

export function isValidCpfCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}
