import plugin from 'tailwindcss/plugin';
import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */

// =============================================================================
// Identidade visual — Pro Accounting
// =============================================================================
// Paleta: AZUL CORPORATIVO (institucional) + ÂMBAR (destaques e avisos).
//
// A rampa `brand` e a `support` são geradas EM TEMPO DE EXECUÇÃO a partir das
// duas cores escolhidas em Configurações → Identidade visual. Os valores
// padrão estão em src/index.css. Nenhum componente referencia cor por código
// hexadecimal — todos usam `brand-*`, `support-*`, `amber-*` ou os tokens
// semânticos do shadcn/ui.
//
// Os números de contraste abaixo valem para a cor padrão. Ao trocar a cor da
// marca, a curva de luminosidade da rampa é preservada (ver lib/theme.ts), o
// que mantém as relações de contraste próximas — mas a tela de configuração
// avisa quando a cor escolhida não alcança o mínimo de 4.5:1 com texto branco.
//
// Contraste (WCAG AA exige 4.5:1 para texto normal):
//   • texto branco sobre brand-600 (#2563EB) ... 5.17:1  OK
//   • texto branco sobre brand-700 (#1D4ED8) ... 6.58:1  OK
//   • texto brand-700 sobre branco ............. 6.58:1  OK
//   • texto branco sobre amber-500 ............. 2.14:1  REPROVADO
//     -> fundo âmbar SEMPRE leva texto escuro (amber-950 / slate-900).
//   • texto amber-700 (#B45309) sobre branco ... 4.61:1  OK
//     -> para texto âmbar pequeno, use 700 ou mais escuro, nunca 500.
// =============================================================================

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Os pontos de quebra padrão do Tailwind mais um: `wide` (1440px).
    //
    // Existe por causa das tabelas. Entre 1280px e 1536px há um salto grande
    // demais: uma coluna que cabe com folga num monitor de 1440px (a largura
    // mais comum de notebook) não cabe em 1280px, e sem este degrau ela teria
    // de ficar escondida até 1536px. Declarado aqui, na ordem — e não em
    // `extend` — porque o Tailwind gera as regras na ordem das chaves.
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      wide: '1440px',
      '2xl': '1536px',
    },
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // --- Cor institucional -------------------------------------------
        // A rampa é declarada como variável CSS, e não como hexadecimal, para
        // que o administrador possa trocar a cor da marca em Configurações e a
        // mudança alcançar as dezenas de classes `brand-*` já espalhadas pelos
        // componentes. Os valores padrão vivem em src/index.css; quem os
        // sobrescreve em tempo de execução é src/lib/theme.ts.
        //
        // O formato `H S% L%` sem a função hsl() é o que permite ao Tailwind
        // aplicar opacidade sobre eles (bg-brand-600/90) — mesma convenção já
        // usada pelos tokens do shadcn logo abaixo.
        brand: {
          50: 'hsl(var(--brand-50))',
          100: 'hsl(var(--brand-100))',
          200: 'hsl(var(--brand-200))',
          300: 'hsl(var(--brand-300))',
          400: 'hsl(var(--brand-400))',
          500: 'hsl(var(--brand-500))',
          600: 'hsl(var(--brand-600))', // cor primária escolhida pelo usuário
          700: 'hsl(var(--brand-700))',
          800: 'hsl(var(--brand-800))',
          900: 'hsl(var(--brand-900))', // fundo do menu lateral
          950: 'hsl(var(--brand-950))',
        },

        // --- Cor secundária ------------------------------------------------
        // Rampa de apoio, derivada da segunda cor configurada. Hoje alimenta a
        // série secundária dos gráficos e realces pontuais.
        support: {
          50: 'hsl(var(--support-50))',
          100: 'hsl(var(--support-100))',
          200: 'hsl(var(--support-200))',
          300: 'hsl(var(--support-300))',
          400: 'hsl(var(--support-400))',
          500: 'hsl(var(--support-500))',
          600: 'hsl(var(--support-600))',
          700: 'hsl(var(--support-700))',
          800: 'hsl(var(--support-800))',
          900: 'hsl(var(--support-900))',
          950: 'hsl(var(--support-950))',
        },

        // O âmbar de destaque é o `amber` nativo do Tailwind (amber-500 =
        // #F59E0B, idêntico à barra de destaque do logo). Não redefinimos a
        // rampa para não perder os tons intermediários já calibrados.

        // --- Tokens semânticos (shadcn/ui) -------------------------------
        // Definidos como variáveis CSS em src/index.css para permitir tema
        // claro/escuro sem reescrever classe nenhuma.
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },

      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      fontFamily: {
        // Inter é carregada em index.html; as demais são fallback do sistema
        // para que nada quebre se a fonte não carregar.
        sans: [
          'Inter',
          'Segoe UI',
          'system-ui',
          '-apple-system',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        // Valores monetários alinham melhor em tabela com largura fixa.
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'Liberation Mono', 'monospace'],
      },

      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(15 23 42 / 0.10), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },

      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    // `touch:` — aplica só onde o ponteiro principal é o dedo. É o critério
    // certo para aumentar alvos de toque: a largura da tela não diz se há
    // mouse (um tablet deitado tem 1180px e nenhum cursor).
    plugin(({ addVariant }) => {
      addVariant('touch', '@media (pointer: coarse)');
    }),
  ],
};
