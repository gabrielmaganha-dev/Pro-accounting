import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { maskCurrency, parseCurrency, toCurrencyInput } from '@/utils/mask';

interface AmountRangeFieldProps {
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}

/**
 * Faixa de valor — filtro usado em Faturas e em Pagamentos.
 *
 * O estado local existe porque o campo é mascarado: a URL guarda `1500.00` e a
 * tela mostra `1.500,00`. Sem o intermediário, cada tecla reescreveria a URL e
 * a máscara brigaria com o cursor.
 */
export function AmountRangeField({ min, max, onChange }: AmountRangeFieldProps) {
  const [minInput, setMinInput] = useState(toCurrencyInput(min));
  const [maxInput, setMaxInput] = useState(toCurrencyInput(max));

  useEffect(() => {
    setMinInput(toCurrencyInput(min));
    setMaxInput(toCurrencyInput(max));
  }, [min, max]);

  function commit(nextMin: string, nextMax: string): void {
    onChange(parseCurrency(nextMin), parseCurrency(nextMax));
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Valor</Label>
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          placeholder="mínimo"
          className="tabular-nums"
          value={minInput}
          onChange={(event) => setMinInput(maskCurrency(event.target.value))}
          onBlur={() => commit(minInput, maxInput)}
          aria-label="Valor mínimo"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          inputMode="numeric"
          placeholder="máximo"
          className="tabular-nums"
          value={maxInput}
          onChange={(event) => setMaxInput(maskCurrency(event.target.value))}
          onBlur={() => commit(minInput, maxInput)}
          aria-label="Valor máximo"
        />
      </div>
    </div>
  );
}
