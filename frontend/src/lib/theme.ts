/**
 * Identidade visual em tempo de execução.
 *
 * O PROBLEMA. As classes `brand-50` … `brand-950` estão espalhadas por dezenas
 * de componentes e, no Tailwind, viram hexadecimais fixos no CSS compilado.
 * Uma cor escolhida pelo usuário no banco não tem como alcançá-las — o CSS já
 * foi gerado quando o projeto compilou.
 *
 * A SOLUÇÃO. `tailwind.config.js` passa a declarar a rampa como
 * `hsl(var(--brand-600))`, e este módulo escreve essas variáveis no
 * `<html>`. As classes continuam as mesmas em todos os componentes; o que muda
 * é o valor por trás delas. Nenhuma tela precisou ser reescrita.
 *
 * O QUE NÃO É CONFIGURÁVEL, de propósito: as cores de ESTADO (verde para pago,
 * âmbar para pendente, vermelho para atrasado). Elas passaram por validação de
 * contraste e de distinção sob daltonismo — ver `lib/chart-theme.ts` — e são
 * semânticas: vermelho significa atraso em qualquer identidade visual. Deixar
 * o usuário pintá-las destruiria tanto a acessibilidade quanto o significado.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '');

  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hexToHsl(hex: string): Hsl {
  return rgbToHsl(hexToRgb(hex));
}

/**
 * Luminosidade de cada degrau da rampa.
 *
 * Os números são os da própria escala do Tailwind, medidos na rampa `blue`
 * original do projeto. Manter essa curva é o que faz uma cor nova continuar
 * legível: `brand-50` tem de servir de fundo claro e `brand-900` de fundo do
 * menu lateral, independentemente do matiz escolhido.
 *
 * O degrau 600 é a ÂNCORA — é a cor que o usuário escolheu, usada nos botões e
 * no que mais aparece. Os outros degraus são derivados dela mantendo matiz e
 * saturação, variando só a luminosidade.
 */
const RAMP_LIGHTNESS: Record<string, number> = {
  '50': 97,
  '100': 94,
  '200': 86,
  '300': 77,
  '400': 66,
  '500': 60,
  '600': 53,
  '700': 46,
  '800': 38,
  '900': 33,
  '950': 21,
};

/** Luminosidade do degrau âncora na curva de referência. */
const ANCHOR_LIGHTNESS = RAMP_LIGHTNESS['600'] as number;

/** Luminosidade do degrau mais claro e do mais escuro da curva de referência. */
const LIGHTEST = RAMP_LIGHTNESS['50'] as number;
const DARKEST = RAMP_LIGHTNESS['950'] as number;

/**
 * Fator de saturação por degrau.
 *
 * A saturação CRESCE em direção aos tons claros e CAI em direção aos escuros —
 * não é simétrica em torno da âncora. Foi o que a primeira versão errou: ela
 * dessaturava as duas pontas, e o `brand-50` (fundo de selo, dez lugares na
 * interface) saía lavado, visivelmente diferente do azul original.
 *
 * Os coeficientes vêm de medir a própria rampa `blue` do Tailwind, paleta de
 * referência do projeto: 100% de saturação no degrau 50 e 57% no 950, com 83%
 * na âncora. Duas retas, uma para cada lado, reproduzem a curva com erro de
 * poucos pontos.
 */
function saturationFactor(referenceLightness: number): number {
  if (referenceLightness >= ANCHOR_LIGHTNESS) {
    return 1 + ((referenceLightness - ANCHOR_LIGHTNESS) * 0.2) / (LIGHTEST - ANCHOR_LIGHTNESS);
  }

  return 1 - ((ANCHOR_LIGHTNESS - referenceLightness) * 0.31) / (ANCHOR_LIGHTNESS - DARKEST);
}

/**
 * Gera a rampa a partir da cor âncora.
 *
 * O DEGRAU 600 É EXATAMENTE A COR ESCOLHIDA — matiz, saturação e luminosidade.
 * Isso não é detalhe: `bg-brand-600` aparece em oito lugares da interface, e o
 * botão usa o token `--primary`, que recebe a cor crua. Se a rampa normalizasse
 * a luminosidade para um valor fixo, os dois mostrariam tons diferentes da
 * "mesma" cor, e a interface pareceria desalinhada com o que o usuário escolheu.
 *
 * Os outros degraus são interpolados ENTRE a cor escolhida e as pontas da
 * escala: os claros caminham até quase branco, os escuros até 40% da
 * luminosidade da âncora. Isso garante três coisas ao mesmo tempo — a rampa é
 * monótona, nunca sai da faixa válida, e reproduz a curva original quando a cor
 * escolhida tem a luminosidade da âncora (53%), que é o caso do azul padrão.
 */
export function buildRamp(hex: string): Record<string, string> {
  const base = hexToHsl(hex);

  // Piso escuro proporcional: uma cor clara não deve gerar um degrau 950 preto,
  // nem uma escura um degrau 950 indistinguível dela mesma.
  const darkFloor = Math.max(Math.round(base.l * 0.4), 8);

  const ramp: Record<string, string> = {};

  for (const [step, referenceLightness] of Object.entries(RAMP_LIGHTNESS)) {
    let lightness: number;

    if (referenceLightness === ANCHOR_LIGHTNESS) {
      lightness = base.l;
    } else if (referenceLightness > ANCHOR_LIGHTNESS) {
      const t = (referenceLightness - ANCHOR_LIGHTNESS) / (LIGHTEST - ANCHOR_LIGHTNESS);
      lightness = Math.round(base.l + t * (LIGHTEST - base.l));
    } else {
      const t = (ANCHOR_LIGHTNESS - referenceLightness) / (ANCHOR_LIGHTNESS - DARKEST);
      lightness = Math.round(base.l - t * (base.l - darkFloor));
    }

    const saturation = Math.round(base.s * saturationFactor(referenceLightness));

    // Recortado em [0, 100]: uma cor já muito saturada estouraria o limite nos
    // tons claros, e o CSS descartaria a declaração inteira.
    ramp[step] = `${base.h} ${Math.min(Math.max(saturation, 0), 100)}% ${Math.min(Math.max(lightness, 0), 100)}%`;
  }

  return ramp;
}

/**
 * Escolhe texto claro ou escuro para ficar sobre a cor.
 *
 * Usa a luminância relativa do WCAG, não a luminosidade do HSL: o olho percebe
 * verde muito mais claro que azul com o mesmo valor de HSL, e decidir por HSL
 * produziria texto branco sobre um amarelo onde ninguém consegue ler.
 */
export function readableForeground(hex: string): string {
  const { r, g, b } = hexToRgb(hex);

  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

  // 0.4 em vez de 0.5: o limiar exato onde branco e preto empatam em contraste
  // fica abaixo do meio da escala.
  return luminance > 0.4 ? '222 47% 11%' : '0 0% 100%';
}

export interface ThemeColors {
  primaryColor: string;
  secondaryColor: string;
}

/**
 * Aplica a identidade visual ao documento.
 *
 * Chamada quando a configuração carrega e a cada vez que o usuário mexe nos
 * seletores da tela de configurações — é isso que dá a pré-visualização ao
 * vivo, sem salvar.
 */
export function applyTheme({ primaryColor, secondaryColor }: ThemeColors): void {
  const root = document.documentElement;

  for (const [step, value] of Object.entries(buildRamp(primaryColor))) {
    root.style.setProperty(`--brand-${step}`, value);
  }

  for (const [step, value] of Object.entries(buildRamp(secondaryColor))) {
    root.style.setProperty(`--support-${step}`, value);
  }

  // Tokens semânticos do shadcn que devem acompanhar a cor principal: é o que
  // faz botão, anel de foco e link mudarem junto com a rampa.
  const primary = hexToHsl(primaryColor);
  root.style.setProperty('--primary', `${primary.h} ${primary.s}% ${primary.l}%`);
  root.style.setProperty('--primary-foreground', readableForeground(primaryColor));
  root.style.setProperty('--ring', `${primary.h} ${primary.s}% ${primary.l}%`);

  // Os gráficos recebem hexadecimal puro porque a biblioteca de gráficos
  // desenha em SVG e não resolve variável CSS nos atributos de preenchimento.
  root.style.setProperty('--chart-primary', primaryColor);
  root.style.setProperty('--chart-secondary', secondaryColor);
}
