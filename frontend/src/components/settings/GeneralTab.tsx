import { Info, Loader2, Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateGeneral } from '@/hooks/use-settings';
import {
  CURRENCY_LABELS,
  DATE_FORMAT_LABELS,
  TIME_ZONE_LABELS,
  type Settings,
  type SettingsOptions,
} from '@/types/settings';

/**
 * Preferências gerais.
 *
 * Uma observação honesta sobre o que cada campo faz HOJE, porque a diferença
 * importa para quem opera o sistema:
 *
 *  • **Antecedência** e **fuso horário** estão ligados de ponta a ponta. Mudar
 *    a antecedência muda na hora quais faturas o painel e o sino consideram
 *    "vencendo"; mudar o fuso muda o que o servidor entende por "hoje", que é a
 *    base de todo cálculo de atraso.
 *  • **Moeda** e **formato de data** são guardados e já viajam para a interface,
 *    mas a exibição continua fixa em Real e dia/mês/ano. Trocá-los não muda a
 *    tela ainda — a etapa pedia a estrutura preparada, e é o que está feito.
 *    O aviso abaixo diz isso ao usuário em vez de deixá-lo achar que o campo
 *    está com defeito.
 */
interface GeneralTabProps {
  settings: Settings;
  options: SettingsOptions;
  canEdit: boolean;
}

export function GeneralTab({ settings, options, canEdit }: GeneralTabProps) {
  const mutation = useUpdateGeneral();

  const [dueSoonDays, setDueSoonDays] = useState(String(settings.dueSoonDays));
  const [currency, setCurrency] = useState(settings.currency);
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [dateFormat, setDateFormat] = useState(settings.dateFormat);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDueSoonDays(String(settings.dueSoonDays));
    setCurrency(settings.currency);
    setTimeZone(settings.timeZone);
    setDateFormat(settings.dateFormat);
    setError(null);
  }, [settings]);

  function handleSubmit(): void {
    const days = Number(dueSoonDays);

    if (!Number.isInteger(days) || days < 1 || days > 90) {
      setError('A antecedência precisa ser um número inteiro de 1 a 90 dias.');
      return;
    }

    setError(null);
    mutation.mutate({ dueSoonDays: days, currency, timeZone, dateFormat });
  }

  const disabled = !canEdit || mutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
          Preferências do sistema
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Valem para todos os usuários — não são preferências individuais.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="due-soon-days">Antecedência do aviso de vencimento</Label>
            <div className="flex items-center gap-2">
              <Input
                id="due-soon-days"
                type="number"
                min={1}
                max={90}
                value={dueSoonDays}
                onChange={(event) => setDueSoonDays(event.target.value)}
                disabled={disabled}
                className="w-24 tabular-nums"
              />
              <span className="text-sm text-muted-foreground">dias antes</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Uma fatura entra em “vencendo em breve” — no sino e no painel — quando faltar este
              número de dias.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="time-zone">Fuso horário</Label>
            <Select value={timeZone} onValueChange={setTimeZone} disabled={disabled}>
              <SelectTrigger id="time-zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.timeZones.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {TIME_ZONE_LABELS[zone] ?? zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Define o que o sistema entende por “hoje” ao calcular atrasos e vencimentos.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currency">Moeda</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={disabled}>
              <SelectTrigger id="currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.currencies.map((code) => (
                  <SelectItem key={code} value={code}>
                    {CURRENCY_LABELS[code] ?? code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date-format">Formato de data</Label>
            <Select value={dateFormat} onValueChange={setDateFormat} disabled={disabled}>
              <SelectTrigger id="date-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.dateFormats.map((format) => (
                  <SelectItem key={format} value={format}>
                    {DATE_FORMAT_LABELS[format] ?? format}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dizer o que ainda não tem efeito é mais útil do que deixar o usuário
            salvar e concluir sozinho que o sistema ignorou a escolha. */}
        <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            <strong className="text-foreground">Antecedência</strong> e{' '}
            <strong className="text-foreground">fuso horário</strong> passam a valer assim que
            você salvar. <strong className="text-foreground">Moeda</strong> e{' '}
            <strong className="text-foreground">formato de data</strong> ficam guardados para uma
            próxima etapa — a exibição continua em Real e dia/mês/ano.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {canEdit && (
          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={handleSubmit} disabled={disabled}>
              {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {mutation.isPending ? 'Salvando…' : 'Salvar preferências'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
