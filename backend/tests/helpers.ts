import type { UserRole } from '@prisma/client';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';

import { buildApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { addDays, today } from '../src/utils/date.js';
import { hashPassword } from '../src/utils/password.js';

/**
 * Utilitários compartilhados pela suíte.
 *
 * As requisições passam por `app.inject()`: a pilha inteira roda — helmet,
 * CORS, rate limit, JWT, guards, validação, serviço, banco e handler de erro —
 * sem abrir porta nem depender de rede.
 */

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

export const DEFAULT_PASSWORD = 'Senha@Forte123';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  token: string;
}

let userSequence = 0;

/**
 * Cria um usuário direto no banco e devolve um token válido para ele.
 *
 * O token é assinado pela própria app em vez de obtido por `/auth/login`: o
 * login tem limite de 10 tentativas por minuto, e usá-lo em cada teste faria a
 * suíte esbarrar no rate limit. O login em si é testado em auth.test.ts.
 */
export async function createUser(
  app: FastifyInstance,
  options: { role?: UserRole; active?: boolean; password?: string; email?: string } = {},
): Promise<TestUser> {
  userSequence += 1;
  const role = options.role ?? 'EMPLOYEE';

  const user = await prisma.user.create({
    data: {
      name: role === 'ADMIN' ? `Admin ${userSequence}` : `Funcionário ${userSequence}`,
      email: options.email ?? `usuario${userSequence}@teste.com.br`,
      password: await hashPassword(options.password ?? DEFAULT_PASSWORD),
      role,
      active: options.active ?? true,
    },
  });

  const token = app.jwt.sign({ sub: user.id, name: user.name, email: user.email, role: user.role });

  return { id: user.id, name: user.name, email: user.email, role: user.role, token };
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Requisição autenticada. `token` nulo = sem cabeçalho Authorization. */
export async function request(
  app: FastifyInstance,
  method: Method,
  url: string,
  token: string | null,
  payload?: unknown,
): Promise<LightMyRequestResponse> {
  const options: InjectOptions = {
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };

  if (payload !== undefined) options.payload = payload as InjectOptions['payload'];

  return app.inject(options);
}

/** Corpo JSON da resposta, tipado de forma frouxa para asserções. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function body(response: LightMyRequestResponse): any {
  return response.json();
}

// ---------------------------------------------------------------------------
// Documentos válidos
// ---------------------------------------------------------------------------

/** CPF válido a partir de um número de 1 a 999.999.999. */
export function makeCpf(seed: number): string {
  const base = String(seed).padStart(9, '0').split('').map(Number);
  const first = cpfDigit(base, 10);
  const second = cpfDigit([...base, first], 11);
  return [...base, first, second].join('');
}

function cpfDigit(digits: number[], startWeight: number): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (startWeight - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** CNPJ válido a partir de um número de 1 a 99.999.999 (matriz 0001). */
export function makeCnpj(seed: number): string {
  const base = `${String(seed).padStart(8, '0')}0001`.split('').map(Number);
  const first = cnpjDigit(base);
  const second = cnpjDigit([...base, first]);
  return [...base, first, second].join('');
}

function cnpjDigit(digits: number[]): number {
  const weights =
    digits.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + (digits[index] ?? 0) * weight, 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

// ---------------------------------------------------------------------------
// Datas relativas a hoje (no fuso do escritório)
// ---------------------------------------------------------------------------

export function isoToday(): string {
  return today();
}

export function isoDaysFromToday(days: number): string {
  return addDays(today(), days);
}

// ---------------------------------------------------------------------------
// Fábricas via API
// ---------------------------------------------------------------------------

let documentSequence = 100;

export function nextCpf(): string {
  documentSequence += 1;
  return makeCpf(documentSequence * 7919);
}

export async function apiCreateClient(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await request(app, 'POST', '/api/clients', token, {
    name: 'Cliente de Teste Ltda',
    cpfCnpj: nextCpf(),
    email: 'contato@cliente.com.br',
    ...overrides,
  });

  if (response.statusCode !== 201) {
    throw new Error(`Falha ao criar cliente: ${response.statusCode} ${response.body}`);
  }

  return body(response).data as { id: string; name: string; cpfCnpj: string };
}

let contractSequence = 0;

export async function apiCreateContract(
  app: FastifyInstance,
  token: string,
  clientId: string,
  overrides: Record<string, unknown> = {},
) {
  contractSequence += 1;
  const response = await request(app, 'POST', '/api/contracts', token, {
    clientId,
    number: `CT-TESTE-${String(contractSequence).padStart(4, '0')}`,
    serviceType: 'Contabilidade mensal',
    startDate: isoDaysFromToday(-30),
    endDate: isoDaysFromToday(335),
    monthlyValue: '1500.00',
    dueDay: 10,
    ...overrides,
  });

  if (response.statusCode !== 201) {
    throw new Error(`Falha ao criar contrato: ${response.statusCode} ${response.body}`);
  }

  return body(response).data as { id: string; number: string; clientId: string };
}

let invoiceSequence = 0;

export async function apiCreateInvoice(
  app: FastifyInstance,
  token: string,
  clientId: string,
  overrides: Record<string, unknown> = {},
) {
  invoiceSequence += 1;
  const response = await request(app, 'POST', '/api/invoices', token, {
    clientId,
    number: `FAT-TESTE-${String(invoiceSequence).padStart(5, '0')}`,
    amount: '1500.00',
    issueDate: isoToday(),
    dueDate: isoDaysFromToday(10),
    ...overrides,
  });

  if (response.statusCode !== 201) {
    throw new Error(`Falha ao criar fatura: ${response.statusCode} ${response.body}`);
  }

  return body(response).data as {
    id: string;
    number: string;
    amount: string;
    status: string;
    outstanding: string;
  };
}
