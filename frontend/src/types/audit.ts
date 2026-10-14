export const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'CREATE',
  'UPDATE',
  'ACTIVATE',
  'DEACTIVATE',
  'CANCEL',
  'REOPEN',
  'DELETE',
  'PAYMENT_REGISTERED',
  'PAYMENT_REVERSED',
  'ROLE_CHANGED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'SETTINGS_UPDATED',
  'EXPORT',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = [
  'SESSION',
  'USER',
  'CLIENT',
  'CONTRACT',
  'INVOICE',
  'PAYMENT',
  'SETTINGS',
  'REPORT',
] as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: 'Entrou no sistema',
  LOGIN_FAILED: 'Tentativa recusada',
  LOGOUT: 'Saiu do sistema',
  CREATE: 'Cadastrou',
  UPDATE: 'Alterou',
  ACTIVATE: 'Reativou',
  DEACTIVATE: 'Inativou',
  CANCEL: 'Cancelou',
  REOPEN: 'Reabriu',
  DELETE: 'Excluiu',
  PAYMENT_REGISTERED: 'Registrou pagamento',
  PAYMENT_REVERSED: 'Estornou pagamento',
  ROLE_CHANGED: 'Alterou perfil de acesso',
  PASSWORD_CHANGED: 'Trocou a senha',
  PASSWORD_RESET: 'Resetou o acesso',
  SETTINGS_UPDATED: 'Alterou configuração',
  EXPORT: 'Exportou dados',
};

export const AUDIT_ENTITY_LABELS: Record<AuditEntity, string> = {
  SESSION: 'Sessão',
  USER: 'Usuário',
  CLIENT: 'Cliente',
  CONTRACT: 'Contrato',
  INVOICE: 'Fatura',
  PAYMENT: 'Pagamento',
  SETTINGS: 'Configuração',
  REPORT: 'Relatório',
};

/**
 * Urgência visual de cada ação.
 *
 * `critical` para o que precisa salta aos olhos numa varredura: tentativa de
 * login recusada, exclusão, mudança de privilégio e reset de acesso. O resto é
 * rotina, e pintar tudo de vermelho faria o vermelho deixar de significar algo.
 */
export type AuditSeverity = 'critical' | 'warning' | 'neutral';

export const AUDIT_ACTION_SEVERITY: Record<AuditAction, AuditSeverity> = {
  LOGIN_FAILED: 'critical',
  DELETE: 'critical',
  ROLE_CHANGED: 'critical',
  PASSWORD_RESET: 'critical',

  CANCEL: 'warning',
  DEACTIVATE: 'warning',
  PAYMENT_REVERSED: 'warning',
  PASSWORD_CHANGED: 'warning',
  SETTINGS_UPDATED: 'warning',
  EXPORT: 'warning',

  LOGIN: 'neutral',
  LOGOUT: 'neutral',
  CREATE: 'neutral',
  UPDATE: 'neutral',
  ACTIVATE: 'neutral',
  REOPEN: 'neutral',
  PAYMENT_REGISTERED: 'neutral',
};

export interface AuditLog {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string | null;
  entityLabel: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditSummary {
  total: number;
  last24h: number;
  failedLogins7d: number;
  activeUsers7d: number;
}

export interface AuditFilters {
  action?: AuditAction;
  entity?: AuditEntity;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditPage {
  items: AuditLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: AuditSummary;
}
