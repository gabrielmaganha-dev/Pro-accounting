import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */

// =============================================================================
// Identidade visual — Pro Accounting
// =============================================================================
// Paleta: AZUL CORPORATIVO (institucional) + ÂMBAR (destaques e avisos).
//
// Quando o logotipo oficial chegar, ajuste apenas a rampa `brand` abaixo para
// os tons exatos dele. Nenhum componente referencia cor por código hexadecimal
// — todos usam `brand-*`, `amber-*` ou os tokens semânticos do shadcn/ui.
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
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // --- Cor institucional -------------------------------------------
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB', // cor primária — a mesma do símbolo do logo
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A', // fundo do menu lateral
          950: '#172554',
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
  plugins: [tailwindcssAnimate],
};
