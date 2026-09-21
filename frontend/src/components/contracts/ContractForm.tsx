import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Loader2, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ClientPicker } from '@/components/clients/ClientPicker';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { useAuth } from '@/hooks/use-auth';
import { useNextContractNumber } from '@/hooks/use-contracts';
import {
  CONTRACT_STATUS_HINTS,
  CONTRACT_STATUS_OPTIONS,
  type ContractClient,
  type ContractDetail,
  type ContractPayload,
} from '@/types/contract';
import { CONTRACT_STATUS_LABELS } from '@/types/dashboard';
import { maskCurrency, parseCurrency, toCurrencyInput } from '@/utils/mask';

/**
 * Validação do formulário — espelha backend/src/validators/contract.validator.ts.
 *
 * As três regras que o enunciado exige ficam visíveis aqui: cliente
 * obrigatório, valor maior que zero e término nunca antes do início. A API
 * revalida tudo; esta camada existe para que o erro apareça no campo certo
 * antes de uma ida ao servidor.
 */
const contractFormSchema = z
  .object({
    clientId: z.string().min(1, 'Selecione o cliente do contrato.'),

    number: z
      .string()
      .trim()
      .min(1, 'Informe o número do contrato.')
      .max(30, 'Máximo de 30 caracteres.'),

    serviceType: z
      .string()
      .trim()
      .min(2, 'Informe o tipo de serviço (mínimo 2 caracteres).')
      .max(120, 'Máximo de 120 caracteres.'),

    startDate: z.string().min(1, 'Informe a data de início.'),

    /** Vazio = prazo indeterminado, que é um contrato legítimo. */
    endDate: z.string(),

    monthlyValue: z
      .string()
      .min(1, 'Informe o valor mensal.')
      .refine((value) => Number(parseCurrency(value)) > 0, {
        message: 'O valor mensal precisa ser maior que zero.',
      }),

    dueDay: z.string().min(1, 'Selecione o dia de vencimento.'),

    status: z.enum(['ACTIVE', 'PENDING', 'RENEWAL', 'CLOSED', 'CANCELLED']),

    notes: z.string().trim().max(2000, 'Máximo de 2000 caracteres.'),
  })
  .refine((data) => data.endDate === '' || data.endDate >= data.startDate, {
    message: 'A data de término não pode ser anterior à data de início.',
    path: ['endDate'],
  });

type ContractFormValues = z.infer<typeof contractFormSchema>;

const EMPTY_VALUES: ContractFormValues = {
  clientId: '',
  number: '',
  serviceType: '',
  startDate: '',
  endDate: '',
  monthlyValue: '',
  dueDay: '10',
  status: 'ACTIVE',
  notes: '',
};

/** 1 a 31, para o Select do dia de vencimento. */
const DUE_DAYS = Array.from({ length: 31 }, (_, index) => String(index + 1));

interface ContractFormProps {
  /** Ausente = cadastro novo. */
  contract?: ContractDetail;
  /** Cliente pré-selecionado ao criar a partir da ficha de um cliente. */
  initialClient?: ContractClient;
  onSubmit: (payload: ContractPayload) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ContractForm({
  contract,
  initialClient,
  onSubmit,
  onCancel,
  isSubmitting,
}: ContractFormProps) {
  const { user } = useAuth();
  const isEditing = contract !== undefined;
  const isAdmin = user?.role === 'ADMIN';

  const [selectedClient, setSelectedClient] = useState<ContractClient | null>(
    contract?.client ?? initialClient ?? null,
  );

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: contract
      ? toFormValues(contract)
      : { ...EMPTY_VALUES, clientId: initialClient?.id ?? '', startDate: todayIso() },
  });

  // Só busca sugestão de número em cadastro novo: numa edição o contrato já
  // tem o seu, e sobrescrevê-lo apagaria a numeração do escritório.
  const { data: suggestion } = useNextContractNumber(!isEditing);

  useEffect(() => {
    if (isEditing || !suggestion) return;

    // `getValues` em vez de observar o campo: se a pessoa já digitou um número
    // enquanto a sugestão carregava, a digitação dela vence.
    if (form.getValues('number').trim() === '') {
      form.setValue('number', suggestion.number);
    }
  }, [suggestion, isEditing, form]);

  function handleSelectClient(client: ContractClient): void {
    setSelectedClient(client);
    form.setValue('clientId', client.id, { shouldValidate: true });
  }

  function handleClearClient(): void {
    setSelectedClient(null);
    form.setValue('clientId', '', { shouldValidate: true });
  }

  function handleSubmit(values: ContractFormValues): void {
    onSubmit(toPayload(values));
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" noValidate>
        {isEditing && !isAdmin && (
          <Alert variant="info">
            <Info />
            <AlertDescription>
              Seu perfil é <strong>Funcionário</strong>: você pode corrigir os dados do contrato,
              mas encerrar, cancelar e renovar são ações de administrador.
            </AlertDescription>
          </Alert>
        )}

        {/* ---------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>

          <CardContent>
            <FormField
              control={form.control}
              name="clientId"
              render={({ fieldState }) => (
                <FormItem>
                  <FormLabel>Cliente do contrato *</FormLabel>
                  <ClientPicker
                    selected={selectedClient}
                    onSelect={handleSelectClient}
                    onClear={handleClearClient}
                    disabled={isSubmitting}
                    hasError={Boolean(fieldState.error)}
                  />
                  <FormDescription>
                    Todo contrato pertence a um cliente. Para trocar, remova o atual e busque
                    outro.
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
            <CardTitle className="text-base">Identificação</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número do contrato *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: CT-2026-0001" disabled={isSubmitting} {...field} />
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
              name="serviceType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de serviço *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex.: Contabilidade mensal"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Situação</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    // Numa edição, mudar a situação é ação de administrador — a
                    // API recusaria de qualquer forma. No cadastro todos podem
                    // escolher, senão não seria possível criar um contrato
                    // ainda pendente de início.
                    disabled={isSubmitting || (isEditing && !isAdmin)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CONTRACT_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {CONTRACT_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{CONTRACT_STATUS_HINTS[field.value]}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Vigência e cobrança</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de início *</FormLabel>
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
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de término</FormLabel>
                  <FormControl>
                    <Input type="date" disabled={isSubmitting} {...field} />
                  </FormControl>
                  <FormDescription>
                    Deixe em branco para prazo indeterminado.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="monthlyValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor mensal *</FormLabel>
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
              name="dueDay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dia de vencimento *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    {/* Lista fechada de 1 a 31 em vez de campo numérico: um
                        input livre aceita 0, 45 e texto colado, e a recusa só
                        apareceria depois de enviar. */}
                    <SelectContent className="max-h-60">
                      {DUE_DAYS.map((day) => (
                        <SelectItem key={day} value={day}>
                          Dia {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {Number(field.value) > 28
                      ? 'Meses mais curtos não têm este dia e exigirão ajuste na emissão.'
                      : 'Dia do mês em que a fatura deste contrato vence.'}
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
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Escopo acordado, condições especiais, reajustes combinados."
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            <X />
            Cancelar
          </Button>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />}
            {isSubmitting ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Cadastrar contrato'}
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

/** Converte o contrato da API para os valores do formulário. */
function toFormValues(contract: ContractDetail): ContractFormValues {
  return {
    clientId: contract.clientId,
    number: contract.number,
    serviceType: contract.serviceType,
    startDate: contract.startDate,
    endDate: contract.endDate ?? '',
    monthlyValue: toCurrencyInput(contract.monthlyValue),
    dueDay: String(contract.dueDay),
    status: contract.status,
    notes: contract.notes ?? '',
  };
}

/** Converte o formulário para o payload da API. */
function toPayload(values: ContractFormValues): ContractPayload {
  return {
    clientId: values.clientId,
    number: values.number.trim().toUpperCase(),
    serviceType: values.serviceType.trim(),
    startDate: values.startDate,
    // `null` explícito, não `undefined`: numa edição, limpar o campo precisa
    // gravar "prazo indeterminado". Omitir o campo faria a API manter a data
    // que estava lá, e o contrato nunca deixaria de ter término.
    endDate: values.endDate === '' ? null : values.endDate,
    monthlyValue: parseCurrency(values.monthlyValue),
    dueDay: Number(values.dueDay),
    status: values.status,
    // Sempre enviado, inclusive vazio: é assim que apagar as observações numa
    // edição de fato as apaga, em vez de manter silenciosamente o texto antigo.
    notes: values.notes.trim(),
  };
}
