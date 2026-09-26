/**
 * Data de hoje em `YYYY-MM-DD`, no fuso do navegador.
 *
 * Serve para PREENCHER campos de data e para comparações de exibição. A regra
 * que vale — o que está atrasado, se um pagamento pode ter a data informada —
 * é decidida pela API, no fuso do escritório.
 */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}
