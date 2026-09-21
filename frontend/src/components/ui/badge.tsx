import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Selo de status.
 *
 * As variantes já implementam as cores combinadas para o sistema:
 *
 *   Pago / Ativo ......... verde
 *   Pendente ............. âmbar
 *   Atrasado / Encerrado . vermelho
 *   Cancelado ............ cinza
 *
 * Todas usam fundo claro (tom 50/100) com texto escuro (tom 700/800). Fundo
 * saturado com texto branco reprovaria no contraste no caso do âmbar, e ter
 * uma regra só para um status deixaria a tabela visualmente desequilibrada.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-brand-200 bg-brand-50 text-brand-700',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        danger: 'border-red-200 bg-red-50 text-red-700',
        neutral: 'border-slate-200 bg-slate-100 text-slate-600',
        outline: 'border-border bg-transparent text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
