import { FileText, Lock, ReceiptText, Users, Wallet, type LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import {
  REPORT_GROUP_LABELS,
  REPORT_GROUP_ORDER,
  type ReportCatalogItem,
  type ReportGroup,
} from '@/types/report';
import { cn } from '@/lib/utils';

const GROUP_ICONS: Record<ReportGroup, LucideIcon> = {
  clients: Users,
  contracts: FileText,
  invoices: ReceiptText,
  finance: Wallet,
};

/**
 * Catálogo de relatórios, agrupado.
 *
 * A lista vem inteira do backend — a interface não tem nenhum relatório escrito
 * no código. Um relatório novo aparece aqui sozinho, com o título e a descrição
 * que a definição declarou.
 *
 * O funcionário simplesmente não recebe os relatórios financeiros no catálogo,
 * então o grupo "Financeiro" nem chega a ser desenhado para ele. Isso é
 * conveniência de tela; quem barra de fato é a checagem do servidor.
 */
interface ReportPickerProps {
  reports: ReportCatalogItem[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function ReportPicker({ reports, selectedId, onSelect }: ReportPickerProps) {
  const groups = REPORT_GROUP_ORDER.map((group) => ({
    group,
    items: reports.filter((report) => report.group === group),
  })).filter((entry) => entry.items.length > 0);

  return (
    <div className="space-y-5">
      {groups.map(({ group, items }) => {
        const Icon = GROUP_ICONS[group];

        return (
          <div key={group}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              {REPORT_GROUP_LABELS[group]}
              {group === 'finance' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  <Lock className="size-3" aria-hidden="true" />
                  administradores
                </span>
              )}
            </h3>

            {/* Duas colunas já no celular, só com os títulos: em coluna
                única com descrição, os quinze relatórios ocupavam quatro telas
                de rolagem antes de o relatório em si aparecer. */}
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {items.map((report) => {
                const isSelected = report.id === selectedId;

                return (
                  <Card
                    key={report.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(report.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(report.id);
                      }
                    }}
                    aria-pressed={isSelected}
                    className={cn(
                      'cursor-pointer transition-colors hover:border-brand-300',
                      isSelected && 'border-brand-500 bg-brand-50/60',
                    )}
                  >
                    <CardContent className="p-3">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          isSelected ? 'text-brand-700' : 'text-foreground',
                        )}
                      >
                        {report.title}
                      </p>
                      {/* A descrição diz o que ENTRA e o que fica de fora. Sem
                          ela, "Pendências" e "Atrasos" parecem o mesmo
                          relatório com nomes diferentes. */}
                      <p className="mt-1 hidden text-xs leading-relaxed text-muted-foreground sm:line-clamp-3">
                        {report.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
