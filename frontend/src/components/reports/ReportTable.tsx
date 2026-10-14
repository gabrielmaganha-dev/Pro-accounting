import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ReportCell, ReportColumn, ReportColumnKind, ReportRow } from '@/types/report';
import { formatCurrency, formatDate } from '@/utils/format';

/**
 * Tabela genérica de relatório.
 *
 * Não conhece nenhum relatório: recebe as colunas que o catálogo descreveu e
 * desenha o que vier. É o que permite acrescentar um relatório no backend e ele
 * aparecer na tela sem uma linha de frontend nova.
 *
 * A formatação segue o `kind` da coluna, o mesmo que o backend usa nos
 * arquivos exportados — assim o número na tela e o número no PDF são o mesmo
 * número, escrito do mesmo jeito.
 */
function renderCell(value: ReportCell, kind: ReportColumnKind) {
  if (value === null || value === undefined || value === '') {
    // Travessão em vez de célula vazia: distingue "não se aplica" de "o dado
    // não carregou", que uma célula em branco deixaria ambíguo.
    return <span className="text-muted-foreground">—</span>;
  }

  const text = String(value);

  if (kind === 'money') return formatCurrency(text);
  if (kind === 'date') return formatDate(text);

  return text;
}

/**
 * Primeira coluna fixa em telas estreitas.
 *
 * Um relatório tem as colunas que o backend declarar — oito, dez — e não há
 * como encaixá-las em 360px. A rolagem lateral aqui é inevitável; o que dá para
 * evitar é perder de vista DE QUEM é a linha enquanto se rola. A partir de
 * 1024px a tabela costuma caber e a coluna volta ao comportamento normal.
 */
const STICKY_FIRST =
  'max-lg:sticky max-lg:left-0 max-lg:z-10 max-lg:max-w-[150px] max-lg:whitespace-normal max-lg:bg-card max-lg:shadow-[1px_0_0_hsl(var(--border))]';

function alignment(kind: ReportColumnKind): string {
  return kind === 'money' || kind === 'number' || kind === 'integer'
    ? 'text-right tabular-nums'
    : '';
}

interface ReportTableProps {
  columns: ReportColumn[];
  rows: ReportRow[];
}

export function ReportTable({ columns, rows }: ReportTableProps) {
  return (
    // Sem <div> de rolagem próprio: o <Table> já traz o dele, e a coluna fixa
    // precisa que a área rolável seja o ancestral imediato.
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((column, columnIndex) => (
            <TableHead
              key={column.key}
              className={cn(alignment(column.kind), columnIndex === 0 && STICKY_FIRST)}
            >
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((row, index) => (
          // Sem realce ao passar o mouse: as linhas não são clicáveis, e o
          // realce sugeria que fossem.
          <TableRow key={index} className="hover:bg-transparent">
            {columns.map((column, columnIndex) => (
              <TableCell
                key={column.key}
                className={cn(
                  alignment(column.kind),
                  column.kind === 'text' ? 'max-w-[240px] truncate' : 'whitespace-nowrap',
                  columnIndex === 0 && STICKY_FIRST,
                )}
              >
                {renderCell(row[column.key] ?? null, column.kind)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
