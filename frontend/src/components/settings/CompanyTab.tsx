import { Building2, Loader2, Save } from 'lucide-react';
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
import { useUpdateCompany } from '@/hooks/use-settings';
import { BRAZILIAN_STATES } from '@/types/client';
import type { CompanyPayload, Settings } from '@/types/settings';
import { isValidCpfCnpj } from '@/utils/document';
import { maskCpfCnpj, maskPhone, maskZipCode, unmask } from '@/utils/mask';

/**
 * Dados da empresa.
 *
 * São os dados que saem em documento: o endereço no rodapé de um relatório, o
 * CNPJ numa cobrança. Por isso o endereço é desmembrado, como no cadastro de
 * clientes — emissão fiscal exige os campos separados.
 *
 * Só administradores chegam aqui; o formulário inteiro fica desabilitado para
 * os demais, e a API recusa a escrita de qualquer forma.
 */
interface CompanyTabProps {
  settings: Settings;
  canEdit: boolean;
}

export function CompanyTab({ settings, canEdit }: CompanyTabProps) {
  const mutation = useUpdateCompany();

  const [form, setForm] = useState({
    companyName: '',
    companyCnpj: '',
    companyEmail: '',
    companyPhone: '',
    companyWebsite: '',
    companyZipCode: '',
    companyStreet: '',
    companyNumber: '',
    companyComplement: '',
    companyNeighborhood: '',
    companyCity: '',
    companyState: '',
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      companyName: settings.companyName,
      companyCnpj: maskCpfCnpj(settings.companyCnpj ?? ''),
      companyEmail: settings.companyEmail ?? '',
      companyPhone: maskPhone(settings.companyPhone ?? ''),
      companyWebsite: settings.companyWebsite ?? '',
      companyZipCode: maskZipCode(settings.companyZipCode ?? ''),
      companyStreet: settings.companyStreet ?? '',
      companyNumber: settings.companyNumber ?? '',
      companyComplement: settings.companyComplement ?? '',
      companyNeighborhood: settings.companyNeighborhood ?? '',
      companyCity: settings.companyCity ?? '',
      companyState: settings.companyState ?? '',
    });
    setError(null);
  }, [settings]);

  function set<K extends keyof typeof form>(key: K, value: string): void {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function handleSubmit(): void {
    if (form.companyName.trim().length < 2) {
      setError('Informe o nome da empresa.');
      return;
    }

    const cnpj = unmask(form.companyCnpj);
    if (cnpj.length > 0 && (cnpj.length !== 14 || !isValidCpfCnpj(cnpj))) {
      setError('CNPJ inválido. Confira os números digitados.');
      return;
    }

    setError(null);

    const payload: CompanyPayload = {
      companyName: form.companyName.trim(),
      companyCnpj: cnpj,
      companyEmail: form.companyEmail.trim(),
      companyPhone: unmask(form.companyPhone),
      companyWebsite: form.companyWebsite.trim(),
      companyZipCode: unmask(form.companyZipCode),
      companyStreet: form.companyStreet.trim(),
      companyNumber: form.companyNumber.trim(),
      companyComplement: form.companyComplement.trim(),
      companyNeighborhood: form.companyNeighborhood.trim(),
      companyCity: form.companyCity.trim(),
      companyState: form.companyState,
    };

    mutation.mutate(payload);
  }

  const disabled = !canEdit || mutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
          Dados da empresa
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          É o que aparece nos documentos emitidos pelo sistema e no rodapé dos relatórios.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="company-name">Nome da empresa *</Label>
            <Input
              id="company-name"
              value={form.companyName}
              onChange={(event) => set('companyName', event.target.value)}
              disabled={disabled}
              maxLength={180}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company-cnpj">CNPJ</Label>
            <Input
              id="company-cnpj"
              value={form.companyCnpj}
              onChange={(event) => set('companyCnpj', maskCpfCnpj(event.target.value))}
              placeholder="00.000.000/0000-00"
              disabled={disabled}
              className="tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company-phone">Telefone</Label>
            <Input
              id="company-phone"
              value={form.companyPhone}
              onChange={(event) => set('companyPhone', maskPhone(event.target.value))}
              placeholder="(00) 00000-0000"
              disabled={disabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company-email">E-mail</Label>
            <Input
              id="company-email"
              type="email"
              value={form.companyEmail}
              onChange={(event) => set('companyEmail', event.target.value)}
              placeholder="contato@empresa.com.br"
              disabled={disabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="company-website">Site</Label>
            <Input
              id="company-website"
              value={form.companyWebsite}
              onChange={(event) => set('companyWebsite', event.target.value)}
              placeholder="https://www.empresa.com.br"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">Comece com http:// ou https://.</p>
          </div>
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <h4 className="text-sm font-semibold text-foreground">Endereço</h4>

          <div className="grid gap-4 sm:grid-cols-6">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="company-zip">CEP</Label>
              <Input
                id="company-zip"
                value={form.companyZipCode}
                onChange={(event) => set('companyZipCode', maskZipCode(event.target.value))}
                placeholder="00000-000"
                disabled={disabled}
                className="tabular-nums"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="company-street">Rua</Label>
              <Input
                id="company-street"
                value={form.companyStreet}
                onChange={(event) => set('companyStreet', event.target.value)}
                disabled={disabled}
                maxLength={180}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company-number">Número</Label>
              <Input
                id="company-number"
                value={form.companyNumber}
                onChange={(event) => set('companyNumber', event.target.value)}
                disabled={disabled}
                maxLength={20}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="company-complement">Complemento</Label>
              <Input
                id="company-complement"
                value={form.companyComplement}
                onChange={(event) => set('companyComplement', event.target.value)}
                disabled={disabled}
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="company-neighborhood">Bairro</Label>
              <Input
                id="company-neighborhood"
                value={form.companyNeighborhood}
                onChange={(event) => set('companyNeighborhood', event.target.value)}
                disabled={disabled}
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company-city">Cidade</Label>
              <Input
                id="company-city"
                value={form.companyCity}
                onChange={(event) => set('companyCity', event.target.value)}
                disabled={disabled}
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company-state">UF</Label>
              <Select
                value={form.companyState || undefined}
                onValueChange={(value) => set('companyState', value)}
                disabled={disabled}
              >
                <SelectTrigger id="company-state">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_STATES.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
              {mutation.isPending ? 'Salvando…' : 'Salvar dados da empresa'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
