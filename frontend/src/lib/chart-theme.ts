import type { ContractStatus, EffectiveInvoiceStatus } from '@/types/dashboard';

/**
 * Paleta e parâmetros compartilhados dos gráficos.
 *
 * ---------------------------------------------------------------------------
 * COMO ESTAS CORES FORAM ESCOLHIDAS
 * ---------------------------------------------------------------------------
 * Não foram escolhidas no olho — passaram por um validador que mede banda de
 * luminosidade, croma, separação sob daltonismo (ΔE em OKLab) e contraste
 * contra o fundo. Resultado do conjunto de status abaixo:
 *
 *   Contraste vs. fundo ....... PASSOU nos 5 (todos ≥ 3:1)
 *   Luminosidade .............. PASSOU nos 5
 *   Visão normal .............. PASSOU (pior par ΔE 23.7)
 *   Croma ..................... REPROVOU em #64748B
 *   Daltonismo (protanopia) ... ΔE 7.9 no par âmbar↔verde
 *
 * As duas reprovações são tratadas, não ignoradas:
 *
 *  • O cinza reprova o piso de croma porque É cinza. "Cancelado" significa
 *    ausência, e pintá-lo de uma cor saturada só para passar num teste
 *    numérico mentiria sobre o significado. Mantido de propósito.
 *
 *  • ΔE 7.9 entre âmbar e verde fica na faixa que só é aceitável COM
 *    codificação secundária — quem tem protanopia não distingue os dois pela
 *    cor. Por isso TODA marca de status neste painel carrega o número escrito
 *    ao lado, e os segmentos da rosca têm 2px de separação. A identidade
 *    nunca depende apenas da cor.
 *
 * Um âmbar mais claro (#F59E0B) resolveria o daltonismo mas reprovaria o
 * contraste (2.09:1) — e contraste insuficiente atinge todo mundo, enquanto a
 * confusão de matiz é contornável com rótulo. Por isso a escolha foi o tom
 * mais escuro.
 */

/**
 * Séries temporais de uma variável só — um matiz, sem legenda.
 *
 * Estas DUAS acompanham a identidade visual configurada: a receita usa a cor
 * principal e os clientes novos a secundária, lidas das variáveis CSS que
 * `lib/theme.ts` escreve. O gráfico é SVG e a biblioteca não resolve
 * `var(--x)` dentro dos atributos de preenchimento, por isso a leitura é feita
 * aqui, em JavaScript, no momento de desenhar.
 *
 * As cores de ESTADO abaixo continuam fixas, e é uma decisão: vermelho
 * significa atraso em qualquer identidade visual, e a paleta passou por
 * validação de contraste e de distinção sob daltonismo. Deixá-las
 * configuráveis destruiria as duas coisas.
 */
const SERIES_FALLBACK = { revenue: '#2563EB', clients: '#0D9488' } as const;

/**
 * Lê a cor da variável CSS, caindo no padrão quando ela ainda não foi escrita
 * — o que acontece no primeiro quadro, antes de a configuração chegar da API.
 */
function cssColor(variable: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;

  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

export function seriesColors(): { revenue: string; clients: string } {
  return {
    revenue: cssColor('--chart-primary', SERIES_FALLBACK.revenue),
    clients: cssColor('--chart-secondary', SERIES_FALLBACK.clients),
  };
}

/** Mantido para quem só precisa do valor padrão, sem tocar no documento. */
export const SERIES_COLORS = SERIES_FALLBACK;

/** Cores reservadas para estado. Nunca reutilizadas como "série 4". */
export const STATUS_COLORS = {
  good: '#059669', // emerald-600 — pago, ativo
  warning: '#D97706', // amber-600  — pendente
  info: '#2563EB', // brand-600  — em renovação
  critical: '#DC2626', // red-600    — atrasado, encerrado
  neutral: '#64748B', // slate-500  — cancelado
} as const;

export const INVOICE_STATUS_COLORS: Record<EffectiveInvoiceStatus, string> = {
  PAID: STATUS_COLORS.good,
  PENDING: STATUS_COLORS.warning,
  OVERDUE: STATUS_COLORS.critical,
  CANCELLED: STATUS_COLORS.neutral,
};

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  ACTIVE: STATUS_COLORS.good,
  PENDING: STATUS_COLORS.warning,
  RENEWAL: STATUS_COLORS.info,
  CLOSED: STATUS_COLORS.critical,
  CANCELLED: STATUS_COLORS.neutral,
};

/**
 * Eixos e grade recessivos.
 *
 * A grade é referência, não conteúdo: fina, clara e só horizontal. Linhas
 * verticais em série temporal competem com as próprias barras sem acrescentar
 * informação.
 */
export const AXIS_COLOR = '#94A3B8';
export const GRID_COLOR = '#E2E8F0';
export const TICK_STYLE = { fontSize: 12, fill: '#64748B' } as const;

/** Cantos arredondados no topo da barra, ancorados na linha de base. */
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
export const BAR_RADIUS_HORIZONTAL: [number, number, number, number] = [0, 4, 4, 0];
