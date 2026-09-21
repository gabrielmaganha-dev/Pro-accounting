import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Espaço reservado dos gráficos.
 *
 * Vive fora de DashboardCharts.tsx de propósito: é o fallback exibido
 * ENQUANTO aquele módulo está sendo baixado, então não pode estar dentro dele
 * — senão seria preciso baixar o Recharts para mostrar que o Recharts ainda
 * está carregando.
 */
export function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {[0, 1, 2, 3].map((index) => (
        <Card key={index}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex h-[280px] w-full items-end gap-2 px-2 pb-6" aria-hidden="true">
              {['40%', '65%', '50%', '80%', '55%', '70%', '45%', '75%'].map((height, bar) => (
                <Skeleton key={bar} className="flex-1 rounded-t-md" style={{ height }} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
