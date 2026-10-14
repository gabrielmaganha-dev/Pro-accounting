import { z } from 'zod';

import { isValidIsoDate } from '../utils/date.js';

/**
 * Consulta da trilha de auditoria.
 *
 * As listas são espelhadas dos enums do Prisma. Repeti-las aqui é o preço de
 * validar a query string sem importar o runtime do Prisma dentro do
 * validador — e o `satisfies` abaixo faz o TypeScript acusar se um enum ganhar
 * um valor que esta lista não conhece.
 */
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

const isoDateSchema = z
  .string()
  .trim()
  .refine(isValidIsoDate, { message: 'Data inválida. Use o formato dia/mês/ano.' });

export const listAuditQuerySchema = z
  .object({
    action: z.enum(AUDIT_ACTIONS).optional(),
    entity: z.enum(AUDIT_ENTITIES).optional(),
    userId: z.string().trim().min(1).optional(),
    search: z.string().trim().max(180).optional(),

    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),

    page: z.coerce.number().int().min(1, 'Página inválida.').default(1),
    // Teto de 100, como no resto do sistema.
    pageSize: z.coerce.number().int().min(1).max(100, 'Máximo de 100 por página.').default(20),
  })
  .refine((data) => !data.from || !data.to || data.to >= data.from, {
    message: 'A data final não pode ser anterior à inicial.',
    path: ['to'],
  });

export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;
