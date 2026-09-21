/**
 * Máscaras de digitação.
 *
 * Diferença em relação a `format.ts`: aquelas funções formatam um valor
 * COMPLETO para exibição; estas formatam um valor PARCIAL, enquanto a pessoa
 * ainda está digitando. Por isso toleram entrada incompleta e nunca devolvem
 * "—" nem descartam o que já foi digitado.
 *
 * O valor mascarado existe só na tela. O que é enviado à API passa sempre por
 * `unmask` — o banco guarda apenas dígitos.
 */

export function unmask(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * CPF ou CNPJ, decidido pela quantidade de dígitos já digitados.
 *
 * Até 11 dígitos aplica máscara de CPF; a partir do 12º, de CNPJ. É o
 * comportamento esperado em formulário brasileiro: a pessoa começa a digitar
 * e a máscara se ajusta sozinha, sem precisar escolher o tipo antes.
 */
export function maskCpfCnpj(value: string): string {
  const digits = unmask(value).slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Telefone fixo (10 dígitos) ou celular (11). */
export function maskPhone(value: string): string {
  const digits = unmask(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  }

  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

/** CEP (00000-000). */
export function maskZipCode(value: string): string {
  const digits = unmask(value).slice(0, 8);
  return digits.replace(/^(\d{5})(\d{1,3})$/, '$1-$2');
}

/**
 * Valor monetário em pt-BR, preenchido da direita para a esquerda.
 *
 * O usuário digita apenas dígitos e eles vão ocupando os centavos primeiro:
 * `1` vira `0,01`, `150` vira `1,50`, `150000` vira `1.500,00`. É como
 * funciona qualquer terminal de caixa, e evita o erro clássico de quem digita
 * "1500" num campo livre esperando R$ 1.500,00 e grava R$ 15,00 — ou o
 * inverso.
 *
 * Trabalhar em centavos inteiros também evita o ponto flutuante: o valor só
 * vira decimal no último momento, na conversão para a API.
 */
export function maskCurrency(value: string): string {
  // 12 dígitos = 9.999.999.999,99, o teto do Decimal(12,2) do banco.
  const digits = unmask(value).slice(0, 12).replace(/^0+(?=\d)/, '');

  if (digits.length === 0) return '';

  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Do campo mascarado (`1.500,00`) para o formato da API (`1500.00`). */
export function parseCurrency(masked: string): string {
  const digits = unmask(masked);
  if (digits.length === 0) return '';

  return (Number(digits) / 100).toFixed(2);
}

/** Do formato da API (`1500.00`) para o campo mascarado (`1.500,00`). */
export function toCurrencyInput(apiValue: string | number | null | undefined): string {
  if (apiValue === null || apiValue === undefined || apiValue === '') return '';

  const numeric = typeof apiValue === 'string' ? Number(apiValue) : apiValue;
  if (!Number.isFinite(numeric)) return '';

  return maskCurrency(String(Math.round(numeric * 100)));
}
