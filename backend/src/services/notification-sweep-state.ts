/**
 * Controle de frequência da varredura de notificações.
 *
 * Duas forças opostas:
 *
 *  • O sino consulta a API a cada minuto, e varrer a cada consulta seria
 *    trabalho de banco repetido sem nada ter mudado.
 *  • Quando alguém registra um pagamento, o aviso de "fatura atrasada" precisa
 *    sumir na hora. Esperar o intervalo faria o usuário quitar a cobrança e
 *    continuar vendo o alerta vermelho — que é justamente o tipo de coisa que
 *    ensina a ignorar o sino.
 *
 * O acordo: intervalo mínimo para o polling, e um sinal explícito de "algo
 * mudou" para as escritas. `requestResweep()` zera o relógio, então a próxima
 * consulta varre de verdade.
 *
 * É estado de processo, não de banco. Reiniciar a API só faz a próxima consulta
 * varrer de novo, o que é inofensivo: a varredura é idempotente.
 *
 * ── AO ACRESCENTAR UMA MUTAÇÃO ──────────────────────────────────────────────
 * Toda operação que altere o que gera alerta — vencimento, valor, situação de
 * fatura ou contrato, pagamento — deve chamar `requestResweep()`. Sem isso o
 * alerta correspondente fica desatualizado por até um minuto.
 */

const SWEEP_INTERVAL_MS = 60_000;

let lastSweepAt = 0;

/** Verdadeiro quando já passou o intervalo ou houve escrita desde a última. */
export function shouldSweep(): boolean {
  return Date.now() - lastSweepAt >= SWEEP_INTERVAL_MS;
}

export function markSwept(): void {
  lastSweepAt = Date.now();
}

/** Marca o estado como sujo: a próxima consulta varre, sem esperar o intervalo. */
export function requestResweep(): void {
  lastSweepAt = 0;
}
