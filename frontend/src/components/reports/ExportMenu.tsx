import { Download, FileSpreadsheet, FileText, Loader2, Table2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  REPORT_FORMATS,
  REPORT_FORMAT_HINTS,
  REPORT_FORMAT_LABELS,
  type ReportFormat,
} from '@/types/report';

const ICONS: Record<ReportFormat, typeof FileText> = {
  csv: Table2,
  xlsx: FileSpreadsheet,
  pdf: FileText,
};

/**
 * Menu de exportação.
 *
 * Os três formatos vêm do mesmo relatório e do mesmo recorte de filtros — o
 * arquivo leva o que está na tela, não a página visível. Cada item explica para
 * que serve o formato, porque "CSV, Excel, PDF" sozinho não ajuda quem não sabe
 * a diferença entre os dois primeiros.
 */
interface ExportMenuProps {
  onExport: (format: ReportFormat) => void;
  isPending: boolean;
  disabled?: boolean;
  /** Quantas linhas o arquivo terá — o usuário confere antes de baixar. */
  total: number;
}

export function ExportMenu({ onExport, isPending, disabled, total }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <Download />}
          {isPending ? 'Gerando…' : 'Exportar'}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">Exportar relatório</p>
          <p className="text-xs text-muted-foreground">
            {total === 0
              ? 'Nenhum registro no recorte atual.'
              : `${total} ${total === 1 ? 'registro' : 'registros'}, com os filtros aplicados.`}
          </p>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {REPORT_FORMATS.map((format) => {
          const Icon = ICONS[format];

          return (
            <DropdownMenuItem
              key={format}
              onSelect={() => onExport(format)}
              className="flex-col items-start gap-0.5"
            >
              <span className="flex items-center gap-2 font-medium">
                <Icon className="size-4" />
                {REPORT_FORMAT_LABELS[format]}
              </span>
              <span className="pl-6 text-xs text-muted-foreground">
                {REPORT_FORMAT_HINTS[format]}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
