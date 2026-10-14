export interface Settings {
  id: string;

  // --- Empresa ---
  companyName: string;
  /** Somente dígitos. A máscara é aplicada na exibição. */
  companyCnpj: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  companyWebsite: string | null;
  companyZipCode: string | null;
  companyStreet: string | null;
  companyNumber: string | null;
  companyComplement: string | null;
  companyNeighborhood: string | null;
  companyCity: string | null;
  companyState: string | null;

  // --- Identidade visual ---
  /** Data URL (`data:image/png;base64,…`) ou null para usar o símbolo padrão. */
  logo: string | null;
  primaryColor: string;
  secondaryColor: string;

  // --- Gerais ---
  dueSoonDays: number;
  currency: string;
  timeZone: string;
  dateFormat: string;

  updatedAt: string;
  updatedBy: string | null;
}

/** Listas aceitas pela API, enviadas junto para a interface não manter cópia. */
export interface SettingsOptions {
  currencies: string[];
  timeZones: string[];
  dateFormats: string[];
}

export interface SettingsResponse {
  settings: Settings;
  options: SettingsOptions;
}

export interface CompanyPayload {
  companyName: string;
  companyCnpj?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyWebsite?: string;
  companyZipCode?: string;
  companyStreet?: string;
  companyNumber?: string;
  companyComplement?: string;
  companyNeighborhood?: string;
  companyCity?: string;
  companyState?: string;
}

export interface AppearancePayload {
  primaryColor?: string;
  secondaryColor?: string;
  /** `null` remove o logotipo; ausente mantém o atual. */
  logo?: string | null;
}

export interface GeneralPayload {
  dueSoonDays: number;
  currency: string;
  timeZone: string;
  dateFormat: string;
}

export interface ProfilePayload {
  name: string;
  email: string;
  /** Obrigatória apenas quando o e-mail muda. */
  currentPassword?: string;
}

/** Rótulos em português para os seletores. */
export const CURRENCY_LABELS: Record<string, string> = {
  BRL: 'Real brasileiro (R$)',
  USD: 'Dólar americano (US$)',
  EUR: 'Euro (€)',
};

export const DATE_FORMAT_LABELS: Record<string, string> = {
  'dd/MM/yyyy': '31/12/2026  (dia/mês/ano)',
  'dd-MM-yyyy': '31-12-2026  (dia-mês-ano)',
  'yyyy-MM-dd': '2026-12-31  (ano-mês-dia)',
};

/** Nome da cidade em vez do identificador técnico do fuso. */
export const TIME_ZONE_LABELS: Record<string, string> = {
  'America/Sao_Paulo': 'Brasília, São Paulo, Sul e Sudeste (UTC−3)',
  'America/Manaus': 'Manaus, Amazonas (UTC−4)',
  'America/Cuiaba': 'Cuiabá, Mato Grosso (UTC−4)',
  'America/Belem': 'Belém, Pará (UTC−3)',
  'America/Fortaleza': 'Fortaleza, Ceará (UTC−3)',
  'America/Recife': 'Recife, Pernambuco (UTC−3)',
  'America/Bahia': 'Salvador, Bahia (UTC−3)',
  'America/Rio_Branco': 'Rio Branco, Acre (UTC−5)',
  'America/Boa_Vista': 'Boa Vista, Roraima (UTC−4)',
  'America/Porto_Velho': 'Porto Velho, Rondônia (UTC−4)',
  'America/Campo_Grande': 'Campo Grande, Mato Grosso do Sul (UTC−4)',
  'America/Noronha': 'Fernando de Noronha (UTC−2)',
};
