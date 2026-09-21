import type { ContractStatus, EffectiveInvoiceStatus } from '@/types/dashboard';

export type ClientStatus = 'ACTIVE' | 'INACTIVE';

export interface Client {
  id: string;
  name: string;
  companyName: string | null;
  /** Somente dígitos. A máscara é aplicada na exibição. */
  cpfCnpj: string;
  /** Formato varia por UF; "ISENTO" é valor legítimo. */
  stateRegistration: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;

  // Endereço desmembrado — exigência de emissão fiscal.
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;

  status: ClientStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cliente resumido — o cartão que acompanha contratos e faturas.
 *
 * Fica aqui, e não no módulo que consome, porque três telas precisam do mesmo
 * recorte. Duplicar a interface garantiria que um dia elas divergiriam.
 */
export interface ClientSummary {
  id: string;
  name: string;
  companyName: string | null;
  /** Somente dígitos. A máscara é aplicada na exibição. */
  cpfCnpj: string;
  status: ClientStatus;
}

export interface ClientContractSummary {
  id: string;
  number: string;
  serviceType: string;
  monthlyValue: string;
  dueDay: number;
  startDate: string;
  endDate: string | null;
  status: ContractStatus;
}

export interface ClientInvoice {
  id: string;
  number: string;
  description: string | null;
  amount: string;
  /** Quanto já foi pago — revela pagamento parcial. */
  paidAmount: string;
  outstanding: string;
  issueDate: string;
  dueDate: string;
  status: EffectiveInvoiceStatus;
  contractId: string | null;
  contractNumber: string | null;
}

/**
 * A ficha do cliente NÃO traz a lista de faturas.
 *
 * Elas vêm de `GET /clients/:id/invoices`, paginadas: um cliente antigo
 * acumula centenas, e carregá-las junto tornaria lenta a abertura da ficha
 * para quem só queria ver o telefone.
 */
export interface ClientDetail extends Client {
  contracts: ClientContractSummary[];
  summary: {
    contracts: { total: number; active: number };
    invoices: {
      total: number;
      paid: number;
      pending: number;
      overdue: number;
      cancelled: number;
    };
    amounts: {
      /** Total emitido, exceto canceladas. */
      invoiced: string;
      received: string;
      pending: string;
      overdue: string;
    };
  };
}

export type ClientHistoryAction = 'CREATED' | 'UPDATED' | 'ACTIVATED' | 'DEACTIVATED';

export interface ClientHistoryEntry {
  id: string;
  action: ClientHistoryAction;
  field: string | null;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  userName: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ClientListFilters {
  search?: string;
  status?: ClientStatus;
  state?: string;
  city?: string;
  sort?: 'name' | 'createdAt' | 'updatedAt' | 'city';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ClientPayload {
  name: string;
  companyName?: string;
  cpfCnpj: string;
  stateRegistration?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
  status?: ClientStatus;
}

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
};

export const CLIENT_HISTORY_ACTION_LABELS: Record<ClientHistoryAction, string> = {
  CREATED: 'Cliente cadastrado',
  UPDATED: 'Alteração',
  ACTIVATED: 'Cliente reativado',
  DEACTIVATED: 'Cliente inativado',
};

/**
 * Campos que o perfil FUNCIONÁRIO pode editar.
 *
 * ESPELHO de EMPLOYEE_EDITABLE_FIELDS em backend/src/services/client.service.ts.
 * Aqui a lista serve apenas para desabilitar os campos no formulário — quem
 * realmente impede a gravação é a API. Se as duas listas divergirem, o pior
 * que acontece é o funcionário ver um campo habilitado e receber 403 ao
 * salvar, com a mensagem dizendo qual campo recusou.
 */
export const EMPLOYEE_EDITABLE_FIELDS: readonly (keyof ClientPayload)[] = [
  'email',
  'phone',
  'whatsapp',
  'zipCode',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'notes',
];

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
