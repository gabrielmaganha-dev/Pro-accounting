import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type StatTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Combinações fundo/ícone por significado.
 *
 * Todas usam tom 50 no fundo com tom 600/700 no ícone — contraste suficiente
 * e peso visual uniforme entre os cards, para que nenhum "grite" mais que os
 * outros sem motivo.
 */
const TONE_STYLES: Record<StatTone, string> = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  neutral: 'bg-slate-100 text-slate-600',
};

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: StatTone;
  isLoading?: boolean;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  isLoading = false,
}: StatCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-card-hover">
      <CardContent className="flex items-start gap-4 p-5">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-lg',
            TONE_STYLES[tone],
          )}
        >
          <Icon className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>

          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            // tabular-nums mantém os dígitos com a mesma largura, então os
            // valores dos cards ficam alinhados entre si.
            <p className="mt-1 truncate text-2xl font-semibold tabular-nums text-foreground">
              {value}
            </p>
          )}

          {hint &&
            (isLoading ? (
              <Skeleton className="mt-2 h-3 w-20" />
            ) : (
              <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
