import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Loader2, Save, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

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
import {
  BRAZILIAN_STATES,
  EMPLOYEE_EDITABLE_FIELDS,
  type ClientDetail,
  type ClientPayload,
} from '@/types/client';
import { isValidCpfCnpj } from '@/utils/document';
import { maskCpfCnpj, maskPhone, maskZipCode, unmask } from '@/utils/mask';

/**
 * Validação do formulário — espelha backend/src/validators/client.validator.ts.
 *
 * Campos opcionais aceitam string vazia e a convertem em `undefined` na
 * submissão: um `<input>` HTML não vazio nunca é `null`, ele é `""`, e enviar
 * `""` gravaria string vazia no banco onde o correto é ausência de valor.
 */
const clientFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome ou a razão social (mínimo 2 caracteres).')
    .max(180, 'Máximo de 180 caracteres.'),

  companyName: z.string().trim().max(180, 'Máximo de 180 caracteres.'),

  stateRegistration: z.string().trim().max(20, 'Máximo de 20 caracteres.'),

  cpfCnpj: z
    .string()
    .trim()
    .min(1, 'Informe o CPF ou CNPJ.')
    .refine((value) => [11, 14].includes(unmask(value).length), {
      message: 'O CPF deve ter 11 dígitos e o CNPJ, 14.',
    })
    .refine((value) => isValidCpfCnpj(value), {
      message: 'CPF ou CNPJ inválido. Confira os números digitados.',
    }),

  email: z
    .string()
    .trim()
    .refine((value) => value === '' || z.string().email().safeParse(value).success, {
      message: 'Informe um e-mail válido.',
    }),

  phone: z.string().trim().refine(phoneIsValid, { message: 'Telefone inválido. Use DDD + número.' }),
  whatsapp: z
    .string()
    .trim()
    .refine(phoneIsValid, { message: 'WhatsApp inválido. Use DDD + número.' }),

  zipCode: z
    .string()
    .trim()
    .refine((value) => value === '' || unmask(value).length === 8, {
      message: 'CEP deve ter 8 dígitos.',
    }),

  street: z.string().trim().max(180, 'Máximo de 180 caracteres.'),
  number: z.string().trim().max(20, 'Máximo de 20 caracteres.'),
  complement: z.string().trim().max(120, 'Máximo de 120 caracteres.'),
  neighborhood: z.string().trim().max(120, 'Máximo de 120 caracteres.'),
  city: z.string().trim().max(120, 'Máximo de 120 caracteres.'),
  state: z.string().trim(),

  notes: z.string().trim().max(2000, 'Máximo de 2000 caracteres.'),

  status: z.enum(['ACTIVE', 'INACTIVE']),
});

function phoneIsValid(value: string): boolean {
  const digits = unmask(value);
  return digits.length === 0 || digits.length === 10 || digits.length === 11;
}

type ClientFormValues = z.infer<typeof clientFormSchema>;

const EMPTY_VALUES: ClientFormValues = {
  name: '',
  companyName: '',
  cpfCnpj: '',
  stateRegistration: '',
  email: '',
  phone: '',
  whatsapp: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  notes: '',
  status: 'ACTIVE',
};

interface ClientFormProps {
  /** Ausente = cadastro novo. */
  client?: ClientDetail;
  onSubmit: (payload: ClientPayload) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function ClientForm({ client, onSubmit, onCancel, isSubmitting }: ClientFormProps) {
  const { user } = useAuth();
  const isEditing = client !== undefined;

  // O funcionário só edita dados de contato — e apenas ao EDITAR. No cadastro
  // ele precisa preencher tudo, senão não conseguiria criar cliente algum.
  const isRestricted = isEditing && user?.role !== 'ADMIN';

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: client ? toFormValues(client) : EMPTY_VALUES,
  });

  function isFieldDisabled(field: keyof ClientPayload): boolean {
    if (isSubmitting) return true;
    if (!isRestricted) return false;
    return !EMPLOYEE_EDITABLE_FIELDS.includes(field);
  }

  function handleSubmit(values: ClientFormValues): void {
    onSubmit(toPayload(values));
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" noValidate>
        {isRestricted && (
          <Alert variant="info">
            <Info />
            <AlertDescription>
              Seu perfil é <strong>Funcionário</strong>: você pode atualizar dados de contato e
              endereço. Nome, razão social e CPF/CNPJ só podem ser alterados por um administrador.
            </AlertDescription>
          </Alert>
        )}

        {/* ---------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Identificação</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Nome / Razão social *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex.: Padaria Pão Quente Ltda"
                      disabled={isFieldDisabled('name')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cpfCnpj"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF / CNPJ *</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      disabled={isFieldDisabled('cpfCnpj')}
                      {...field}
                      // A máscara é aplicada a cada tecla; o valor guardado no
                      // formulário fica formatado e só é limpo na submissão.
                      onChange={(event) => field.onChange(maskCpfCnpj(event.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    A máscara se ajusta sozinha entre CPF e CNPJ conforme você digita.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome fantasia</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex.: Pão Quente"
                      disabled={isFieldDisabled('companyName')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stateRegistration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inscrição Estadual</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex.: 110042490114 ou ISENTO"
                      disabled={isFieldDisabled('stateRegistration')}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Deixe em branco ou escreva ISENTO para quem não contribui de ICMS.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Situação</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isFieldDisabled('status')}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Ativo</SelectItem>
                      <SelectItem value="INACTIVE">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {isRestricted
                      ? 'Somente administradores alteram a situação.'
                      : 'Cliente inativo sai das listagens padrão, mas mantém contratos e faturas.'}
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
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      inputMode="email"
                      placeholder="contato@empresa.com.br"
                      disabled={isFieldDisabled('email')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="tel"
                        placeholder="(11) 3333-4444"
                        disabled={isFieldDisabled('phone')}
                        {...field}
                        onChange={(event) => field.onChange(maskPhone(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="whatsapp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="tel"
                        placeholder="(11) 98888-7777"
                        disabled={isFieldDisabled('whatsapp')}
                        {...field}
                        onChange={(event) => field.onChange(maskPhone(event.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------------- */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Endereço</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-6">
            <FormField
              control={form.control}
              name="zipCode"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>CEP</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      placeholder="00000-000"
                      disabled={isFieldDisabled('zipCode')}
                      {...field}
                      onChange={(event) => field.onChange(maskZipCode(event.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="street"
              render={({ field }) => (
                <FormItem className="md:col-span-4">
                  <FormLabel>Rua</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex.: Avenida Paulista"
                      disabled={isFieldDisabled('street')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="number"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Número</FormLabel>
                  <FormControl>
                    {/* Texto, não número: "S/N", "120-A" e "km 42" são
                        endereços reais que um input numérico recusaria. */}
                    <Input placeholder="Ex.: 1578 ou S/N" disabled={isFieldDisabled('number')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="complement"
              render={({ field }) => (
                <FormItem className="md:col-span-4">
                  <FormLabel>Complemento</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex.: Sala 12, Bloco B"
                      disabled={isFieldDisabled('complement')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="neighborhood"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Bairro</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex.: Bela Vista"
                      disabled={isFieldDisabled('neighborhood')}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem className="md:col-span-3">
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: São Paulo" disabled={isFieldDisabled('city')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem className="md:col-span-1">
                  <FormLabel>UF</FormLabel>
                  {/* Select em vez de texto livre: "SP", "sp", "São Paulo" e
                      "S.P." acabariam todos no banco, e o filtro por estado
                      deixaria de funcionar. */}
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isFieldDisabled('state')}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BRAZILIAN_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      placeholder="Anotações internas sobre o cliente."
                      disabled={isFieldDisabled('notes')}
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
            {isSubmitting ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Cadastrar cliente'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Converte o cliente da API (dados limpos) para o formulário (com máscara). */
function toFormValues(client: ClientDetail): ClientFormValues {
  return {
    name: client.name,
    companyName: client.companyName ?? '',
    cpfCnpj: maskCpfCnpj(client.cpfCnpj),
    stateRegistration: client.stateRegistration ?? '',
    email: client.email ?? '',
    phone: client.phone ? maskPhone(client.phone) : '',
    whatsapp: client.whatsapp ? maskPhone(client.whatsapp) : '',
    zipCode: client.zipCode ? maskZipCode(client.zipCode) : '',
    street: client.street ?? '',
    number: client.number ?? '',
    complement: client.complement ?? '',
    neighborhood: client.neighborhood ?? '',
    city: client.city ?? '',
    state: client.state ?? '',
    notes: client.notes ?? '',
    status: client.status,
  };
}

/** Converte o formulário (com máscara) para o payload da API (dados limpos). */
function toPayload(values: ClientFormValues): ClientPayload {
  const optional = (value: string): string | undefined => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  };

  const optionalDigits = (value: string): string | undefined => {
    const digits = unmask(value);
    return digits.length === 0 ? undefined : digits;
  };

  return {
    name: values.name.trim(),
    cpfCnpj: unmask(values.cpfCnpj),
    status: values.status,
    ...(optional(values.companyName) ? { companyName: optional(values.companyName) } : {}),
    ...(optional(values.stateRegistration)
      ? { stateRegistration: optional(values.stateRegistration) }
      : {}),
    ...(optional(values.email) ? { email: optional(values.email) } : {}),
    ...(optionalDigits(values.phone) ? { phone: optionalDigits(values.phone) } : {}),
    ...(optionalDigits(values.whatsapp) ? { whatsapp: optionalDigits(values.whatsapp) } : {}),
    ...(optionalDigits(values.zipCode) ? { zipCode: optionalDigits(values.zipCode) } : {}),
    ...(optional(values.street) ? { street: optional(values.street) } : {}),
    ...(optional(values.number) ? { number: optional(values.number) } : {}),
    ...(optional(values.complement) ? { complement: optional(values.complement) } : {}),
    ...(optional(values.neighborhood) ? { neighborhood: optional(values.neighborhood) } : {}),
    ...(optional(values.city) ? { city: optional(values.city) } : {}),
    ...(optional(values.state) ? { state: optional(values.state) } : {}),
    ...(optional(values.notes) ? { notes: optional(values.notes) } : {}),
  };
}
