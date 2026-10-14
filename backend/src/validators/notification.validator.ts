import { z } from 'zod';

/**
 * Schemas das notificações.
 *
 * Não há schema de CRIAÇÃO de propósito: notificação não é criada por
 * requisição. Ela é derivada do estado por uma varredura no servidor — ver
 * services/notification.service.ts. Um endpoint de criação deixaria o cliente
 * inventar alertas que não correspondem a nada no banco.
 */

export const listNotificationsQuerySchema = z.object({
  /** `unread` é o que o sino usa; `all` alimenta a lista completa. */
  status: z.enum(['all', 'unread', 'read']).default('all'),

  page: z.coerce.number().int().min(1, 'Página inválida.').default(1),
  // Teto de 100: sem ele, `?pageSize=999999` seria uma negação de serviço
  // trivial contra o banco.
  pageSize: z.coerce.number().int().min(1).max(100, 'Máximo de 100 por página.').default(20),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationIdParamSchema = z.object({
  id: z.string().min(1, 'Identificador inválido.'),
});
