import type { ReactNode } from 'react';

interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

interface ChartTooltipProps {
  title: string;
  rows: TooltipRow[];
  children?: ReactNode;
}

/**
 * Caixa do tooltip, compartilhada pelos quatro gráficos.
 *
 * Detalhe que parece cosmético mas não é: o texto usa sempre a cor de tinta
 * padrão, nunca a cor da série. Valor escrito na cor da série costuma ficar
 * ilegível justo nos tons claros, e a identidade da série já é carregada pelo
 * quadradinho colorido ao lado do rótulo.
 */
export function ChartTooltip({ title, rows, children }: ChartTooltipProps) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>

      <div className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-sm">
            {row.color && (
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: row.color }}
              />
            )}
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{row.value}</span>
          </div>
        ))}
      </div>

      {children}
    </div>
  );
}
