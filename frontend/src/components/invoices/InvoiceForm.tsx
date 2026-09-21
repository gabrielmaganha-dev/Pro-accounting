import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ClientPicker } from '@/components/clients/ClientPicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useContracts } from '@/hooks/use-contracts';
import { useNextInvoiceNumber } from '@/hooks/use-invoices';
import type { ClientSummary } from '@/types/client';
import { CONTRACT_STATUS_LABELS } from '@/types/dashboard';
import type { Invoice, InvoicePayload } from '@/types/invoice';
import { formatCurrency } from '@/utils/format';
import { maskCurrency, parseCurrency, toCurrencyInput } from '@/utils/mask';

/**
 * Validação do formulário — espelha backend/src/validators/invoice.validator.ts.
 *
 * Note o que NÃO está aqui: `status`. A situação da fatura é consequência da
 * data, dos pagamentos e do cancelamento — todos conhecidos pelo servidor. Um
 * campo de situação no formulário faria o frontend virar fonte da regra, que é
 * exatamente o que o enunciado pede para evitar.
 */
const invoiceFormSchema = z
  .object({
    clientId: z.string().min(1, 'Selecione o cliente da fatura.'),

    /** Vazio = fatura avulsa, sem contrato. */
    contractId: z.string(),

    number: z
      .string()
      .trim()
      .min(1, 'Informe o número da fatura.')
      .max(30, 'Máximo de 30 caracteres.'),

    description: z.string().trim().max(255, 'Máximo de 255 caracteres.'),

    amount: z
      .string()
      .min(1, 'Informe o valor.')
      .refine((value) => Number(parseCurrency(value)) > 0, {
        message: 'O valor precisa ser maior que zero.',
      }),

    issueDate: z.string().min(1, 'Informe a data de emissão.'),
    dueDate: z.string().min(1, 'Informe o vencimento.'),
  })
  .refine((data) => data.dueDate >= data.issueDate, {
    message: 'O vencimento não pode ser anterior à data de emissão.',
    path: ['dueDate'],
  });

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

/** Valor usado pelo Select para representar "sem contrato". */
const NO_CONTRACT = '__none__';

interface InvoiceFormProps {
  /** Ausente = emissão nova. */
  invoice?: Invoice;
  /** Cliente pré-selecionado ao emitir a partir da ficha de um cliente. */
  initialClient?: ClientSummary;
  /** Contrato pré-selecionado ao emitir a partir da ficha de um contrato. */
  initialContractId?: string;
  onSubmit: (payload: InvoicePayload) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function InvoiceForm({
  invoice,
  initialClient,
  initialContractId,
  onSubmit,
  onCancel,
  isSubmitting,
}: InvoiceFormProps) {
  const isEditing = invoice !== undefined;

  const [selectedClient, setSelectedClient] = useState<ClientSummary | null>(
    invoice?.client ?? initialClient ?? null,
  );

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: invoice
      ? toFormValues(invoice)
      : {
          clientId: initialClient?.id ?? '',
          contractId: initialContractId ?? '',
          number: '',
          description: '',
          amount: '',
          issueDate: todayIso(),
          dueDate: '',
        },
  });

  // Só busca sugestão de número numa emissão nova: numa edição a fatura já tem
  // o seu, e sobrescrevê-lo apagaria a numeração do escritório.
  const { data: suggestion } = useNextInvoiceNumber(!isEditing);

  useEffect(() => {
    if (isEditing || !suggestion) return;

    // `getValues` em vez de observar o campo: se a pessoa já digitou um número
    // enquanto a sugestão carregava, a digitação dela vence.
    if (form.getValues('number').trim() === '') {
      form.setValue('number', suggestion.number);
    }
  }, [suggestion, isEditing, form]);

  /**
   * Contratos do cliente escolhido.
   *
   * Um Select simples basta aqui, ao contrário do cliente: um cliente tem
   * poucos contratos, e a lista inteira cabe na tela. O filtro por `clientId`
   * é o que garante a regra — não é possível escolher o contrato de terceiro,
   * porque ele nem aparece.
   */
  const { data: contracts } = useContracts({
    page: 1,
    pageSize: 100,
    sort: 'startDate',
    order: 'desc',
    ...(selectedClient ? { clientId: selectedClient.id } : {}),
  });

  const contractId = form.watch('contractId');
  const selectedContract = contracts?.items.find((item) => item.id === contractId);

  function handleSelectClient(client: ClientSummary): void {
    setSelectedClient(client);
    form.setValue('clientId', client.id, { shouldValidate: true });
    // Trocar de cliente invalida o contrato escolhido: ele pertencia ao
    // cliente anterior, e mantê-lo produziria justamente o vínculo cruzado que
    // a API recusa.
    form.setValue('contractId', '');
  }

  function handleClearClient(): void {
    setSelectedClient(null);
    form.setValue('clientId', '', { shouldValidate: true });
    form.setValue('contractId', '');
  }

  /**
   * Preenche valor e vencimento a partir do contrato escolhido.
   *
   * É a razão de existir do vínculo: a fatura de um contrato de R$ 1.850 que
   * vence todo dia 15 já nasce com esses números. Só preenche campos vazios —
   * quem digitou um valor diferente tinha um motivo, e sobrescrever seria
   * apagar o trabalho da pessoa.
   */
  function handleSelectContract(value: string): void {
    const id = value === NO_CONTRACT ? '' : value;
    form.setValue('contractId', id);

    const contract = contracts?.items.find((item) => item.id === id);
    if (!contract) return;

    if (form.getValues('amount').trim() === '') {
      form.setValue('amount', toCurrencyInput(contract.monthlyValue));
    }

    if (form.getValues('description').trim() === '') {
      form.setValue('description', contract.serviceType);
    }

    if (form.getValues('dueDate').trim() === '') {
      form.setValue('dueDate', nextDueDate(form.getValues('issueDate'), contract.dueDay));
    }
  }

  function handleSubmit(values: InvoiceFormValues): void {
    onSubmit(toPayload(values));
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" noValidate>
        {/* ---------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Cliente e contrato</CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="clientId"
              render={({ fieldState }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <ClientPicker
                    selected={selectedClient}
                    onSelect={handleSelectClient}
                    onClear={handleClearClient}
                    disabled={isSubmitting}
                    hasError={Boolean(fieldState.error)}
                  />
                  <FormDescription>
                    Toda fatura pertence a um cliente. Trocar o cliente limpa o contrato
                    vinculado.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contractId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contrato</FormLabel>
                  <Select
                    value={field.value || NO_CONTRACT}
                    onValueChange={handleSelectContract}
                    disabled={isSubmitting || !selectedClient}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Fatura avulsa" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CONTRACT}>Fatura avulsa (sem contrato)</SelectItem>
                      {contracts?.items.map((contract) => (
                        <SelectItem key={contract.id} value={contract.id}>
                          {contract.number} · {contract.serviceType} ·{' '}
                          {CONTRACT_STATUS_LABELS[contract.status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {!selectedClient
                      ? 'Escolha o cliente primeiro para ver os contratos dele.'
                      : selectedContract
                        ? `Valor mensal ${formatCurrency(selectedContract.monthlyValue)}, vence dia ${selectedContract.dueDay}.`
                        : 'Deixe como avulsa para um serviço pontual, sem contrato.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Dados da fatura</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: FAT-2026-00001" disabled={isSubmitting} {...field} />
                  </FormControl>
                  <FormDescription>
                    {isEditing
                      ? 'Precisa ser único em todo o sistema.'
                      : 'Sugerido automaticamente. Substitua pela numeração do escritório se preferir.'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        R$
                      </span>
                      <Input
                        inputMode="numeric"
                        placeholder="0,00"
                        className="pl-9 tabular-nums"
                        disabled={isSubmitting}
                        {...field}
                        onChange={(event) => field.onChange(maskCurrency(event.target.value))}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Digite apenas números — os centavos são preenchidos da direita para a esquerda.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="issueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de emissão *</FormLabel>
                  <FormControl>
                    {/* `type="date"` entrega YYYY-MM-DD, exatamente o formato
                        que a API espera — sem conversão de fuso pelo caminho. */}
                    <Input type="date" disabled={isSubmitting} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vencimento *</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      disabled={isSubmitting}
                      min={form.watch('issueDate') || undefined}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    A fatura passa a constar como atrasada no dia seguinte a esta data.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="md:col-span-2">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Ex.: Honorários contábeis — referência 03/2026"
                        disabled={isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Aparece na listagem e é o que identifica a cobrança para o cliente.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            <X />
            Cancelar
          </Button>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
            {isSubmitting ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Emitir fatura'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Data de hoje em `YYYY-MM-DD`, no fuso do navegador. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Próximo vencimento a partir da emissão e do dia do contrato.
 *
 * Se o dia já passou neste mês, joga para o mês seguinte — emitir hoje uma
 * fatura que venceu semana passada nasceria atrasada. Meses curtos usam o
 * último dia disponível: `dueDay` 31 em fevereiro vira 28 ou 29, em vez de
 * transbordar para março.
 */
function nextDueDate(issueIso: string, dueDay: number): string {
  const [year, month, day] = issueIso.split('-').map(Number);
  if (!year || !month || !day) return '';

  const targetMonth = day > dueDay ? month : month - 1;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const safeDay = Math.min(dueDay, lastDay);

  return new Date(Date.UTC(year, targetMonth, safeDay)).toISOString().slice(0, 10);
}

/** Converte a fatura da API para os valores do formulário. */
function toFormValues(invoice: Invoice): InvoiceFormValues {
  return {
    clientId: invoice.clientId,
    contractId: invoice.contractId ?? '',
    number: invoice.number,
    description: invoice.description ?? '',
    amount: toCurrencyInput(invoice.amount),
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
  };
}

/** Converte o formulário para o payload da API. */
function toPayload(values: InvoiceFormValues): InvoicePayload {
  return {
    clientId: values.clientId,
    // `null` explícito, não `undefined`: numa edição, limpar o contrato
    // precisa gravar "fatura avulsa". Omitir o campo faria a API manter o
    // vínculo que estava lá.
    contractId: values.contractId === '' ? null : values.contractId,
    number: values.number.trim().toUpperCase(),
    // Sempre enviado, inclusive vazio: é assim que apagar a descrição numa
    // edição de fato a apaga, em vez de manter silenciosamente o texto antigo.
    description: values.description.trim(),
    amount: parseCurrency(values.amount),
    issueDate: values.issueDate,
    dueDate: values.dueDate,
  };
}
