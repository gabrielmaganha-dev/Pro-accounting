export type NotificationType =
  | 'INVOICE_OVERDUE'
  | 'INVOICE_DUE_SOON'
  | 'CONTRACT_EXPIRING';

export type NotificationSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  /** Rota da interface que resolve o alerta. */
  link: string | null;
  /** Nulo = não lida. O instante responde "quando eu vi isso". */
  readAt: string | null;
  createdAt: string;
  invoiceId: string | null;
  contractId: string | null;
  clientId: string | null;
}

export interface NotificationsPage {
  items: AppNotification[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Não lidas do usuário, independente do filtro — é o número do selo. */
  unreadCount: number;
}

export interface NotificationFilters {
  status?: 'all' | 'unread' | 'read';
  page?: number;
  pageSize?: number;
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  INVOICE_OVERDUE: 'Fatura atrasada',
  INVOICE_DUE_SOON: 'Vencimento próximo',
  CONTRACT_EXPIRING: 'Contrato vencendo',
};
