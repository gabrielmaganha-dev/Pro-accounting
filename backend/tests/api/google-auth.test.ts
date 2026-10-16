import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/prisma.js';
import { body, createTestApp, createUser, DEFAULT_PASSWORD, request } from '../helpers.js';

/**
 * Login com Google (via Supabase Auth).
 *
 * O servidor do Supabase é simulado no nível do `fetch`: cada token de teste
 * corresponde a um usuário do Supabase Auth, montado como o servidor real o
 * devolve em `GET /auth/v1/user`. O que se testa aqui é o que a API faz com a
 * resposta — vínculo, criação, situação da conta e sessão —, nunca o OAuth do
 * Google em si, que é responsabilidade do Supabase.
 */

const SUPABASE_USER_URL = 'http://supabase.teste/auth/v1/user';

interface FakeSupabaseUser {
  id: string;
  email: string;
  provider?: string;
  emailVerified?: boolean;
  name?: string;
  avatar?: string;
}

/** Tokens válidos no "Supabase" simulado. */
let accounts: Record<string, FakeSupabaseUser> = {};
let supabaseDown = false;

function supabaseUserPayload(user: FakeSupabaseUser) {
  const provider = user.provider ?? 'google';
  const verified = user.emailVerified ?? true;

  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: verified ? '2026-10-16T12:00:00Z' : null,
    app_metadata: { provider, providers: [provider] },
    user_metadata: {
      email_verified: verified,
      full_name: user.name ?? 'Pessoa do Google',
      avatar_url: user.avatar ?? 'https://lh3.googleusercontent.com/a/foto-de-teste',
    },
    identities: [
      {
        provider,
        identity_data: { email: user.email, email_verified: verified },
      },
    ],
  };
}

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  if (String(input) !== SUPABASE_USER_URL) {
    throw new Error(`fetch inesperado: ${String(input)}`);
  }

  if (supabaseDown) {
    throw new TypeError('fetch failed');
  }

  const headers = new Headers(init?.headers);
  const token = headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  const account = accounts[token];

  if (headers.get('apikey') !== 'chave-publica-de-teste-0123456789' || !account) {
    return new Response(JSON.stringify({ msg: 'invalid JWT' }), { status: 401 });
  }

  return new Response(JSON.stringify(supabaseUserPayload(account)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

let app: FastifyInstance;

beforeEach(async () => {
  accounts = {};
  supabaseDown = false;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  app = await createTestApp();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await app.close();
});

/** Registra uma identidade no Supabase simulado e devolve o token dela. */
function googleAccount(user: FakeSupabaseUser): string {
  const token = `token-de-teste-${user.id}`;
  accounts[token] = user;
  return token;
}

function googleLogin(accessToken: string, extra: Record<string, unknown> = {}) {
  return request(app, 'POST', '/api/auth/google', null, { accessToken, ...extra });
}

const ID_JOAO = '0f5b6f8e-1b2c-4d3e-8f9a-000000000001';
const ID_OUTRO = '0f5b6f8e-1b2c-4d3e-8f9a-000000000002';

describe('primeiro acesso com Google', () => {
  it('cria a conta como FUNCIONÁRIO PENDENTE, sem senha, e não abre sessão', async () => {
    const token = googleAccount({ id: ID_JOAO, email: 'Joao@Gmail.com', name: 'João Silva' });

    const response = await googleLogin(token);

    expect(response.statusCode).toBe(403);
    expect(body(response).error.code).toBe('ACCOUNT_PENDING');
    expect(body(response).error.message).toBe(
      'Cadastro recebido! Seu acesso está aguardando aprovação do administrador.',
    );
    expect(body(response).data).toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'joao@gmail.com' } });
    expect(user).toMatchObject({
      name: 'João Silva',
      role: 'EMPLOYEE',
      status: 'PENDING',
      password: null,
      authUserId: ID_JOAO,
      avatarUrl: 'https://lh3.googleusercontent.com/a/foto-de-teste',
      mustChangePassword: false,
    });

    const audit = await prisma.auditLog.findFirst({ where: { action: 'CREATE', entity: 'USER' } });
    expect(audit?.entityLabel).toBe('joao@gmail.com');
  });

  it('nunca vira ADMIN — nem se o navegador pedir', async () => {
    const token = googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' });

    await googleLogin(token, { role: 'ADMIN', status: 'ACTIVE', email: 'chefe@empresa.com' });

    const user = await prisma.user.findUniqueOrThrow({ where: { authUserId: ID_JOAO } });
    expect(user.role).toBe('EMPLOYEE');
    expect(user.status).toBe('PENDING');
    expect(user.email).toBe('joao@gmail.com');
  });

  it('segundo acesso com a mesma Conta Google não duplica a conta', async () => {
    const token = googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' });

    await googleLogin(token);
    const second = await googleLogin(token);

    expect(second.statusCode).toBe(403);
    expect(body(second).error.message).toBe(
      'Seu acesso está aguardando aprovação do administrador.',
    );
    expect(await prisma.user.count({ where: { email: 'joao@gmail.com' } })).toBe(1);
  });

  it('depois da aprovação do administrador, entra com sessão normal', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const token = googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' });
    await googleLogin(token);
    const pending = await prisma.user.findUniqueOrThrow({ where: { authUserId: ID_JOAO } });

    const approval = await request(app, 'PATCH', `/api/users/${pending.id}/status`, admin.token, {
      status: 'ACTIVE',
    });
    expect(approval.statusCode).toBe(200);
    expect(body(approval).data.status).toBe('ACTIVE');

    const response = await googleLogin(token);

    expect(response.statusCode).toBe(200);
    const { data } = body(response);
    expect(data.token).toEqual(expect.any(String));
    expect(data.user).toMatchObject({
      id: pending.id,
      email: 'joao@gmail.com',
      role: 'EMPLOYEE',
      hasPassword: false,
      avatarUrl: 'https://lh3.googleusercontent.com/a/foto-de-teste',
    });

    // A sessão é a mesma do login por senha: vale nas rotas protegidas.
    const me = await request(app, 'GET', '/api/auth/me', data.token);
    expect(me.statusCode).toBe(200);
    expect(body(me).data.user.hasPassword).toBe(false);

    const approvalAudit = await prisma.auditLog.findFirst({ where: { action: 'ACTIVATE' } });
    expect(approvalAudit?.metadata).toMatchObject({ aprovacao: true });
  });
});

describe('vínculo com conta já cadastrada', () => {
  it('Conta Google com o e-mail de um usuário existente usa a MESMA conta, com o mesmo perfil', async () => {
    const existing = await createUser(app, { role: 'ADMIN', email: 'joao@gmail.com' });
    const token = googleAccount({ id: ID_JOAO, email: 'joao@gmail.com', name: 'Nome do Google' });

    const response = await googleLogin(token);

    expect(response.statusCode).toBe(200);
    expect(body(response).data.user).toMatchObject({ id: existing.id, role: 'ADMIN' });
    expect(await prisma.user.count({ where: { email: 'joao@gmail.com' } })).toBe(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(user.authUserId).toBe(ID_JOAO);
    // O nome do cadastro não é sobrescrito pelo do Google.
    expect(user.name).toBe(existing.name);

    // O login por senha continua funcionando para a mesma conta.
    const byPassword = await request(app, 'POST', '/api/auth/login', null, {
      email: 'joao@gmail.com',
      password: DEFAULT_PASSWORD,
    });
    expect(byPassword.statusCode).toBe(200);
    expect(body(byPassword).data.user.id).toBe(existing.id);
  });

  it('e-mail já vinculado a OUTRA Conta Google: recusa, sem alterar nada', async () => {
    await createUser(app, { email: 'joao@gmail.com' });
    await googleLogin(googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' }));

    const response = await googleLogin(googleAccount({ id: ID_OUTRO, email: 'joao@gmail.com' }));

    expect(response.statusCode).toBe(409);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'joao@gmail.com' } });
    expect(user.authUserId).toBe(ID_JOAO);
    expect(await prisma.user.count()).toBe(1);
  });

  it('o administrador não consegue cadastrar outro usuário com o e-mail de uma conta Google', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    await googleLogin(googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' }));

    const response = await request(app, 'POST', '/api/users', admin.token, {
      name: 'João Duplicado',
      email: 'JOAO@gmail.com',
      password: 'Outra@Senha2026',
      role: 'EMPLOYEE',
    });

    expect(response.statusCode).toBe(409);
    expect(await prisma.user.count({ where: { email: 'joao@gmail.com' } })).toBe(1);
  });

  it('conta vinculada e depois bloqueada não entra pelo Google', async () => {
    await createUser(app, { email: 'joao@gmail.com', status: 'BLOCKED' });

    const response = await googleLogin(googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' }));

    expect(response.statusCode).toBe(403);
    expect(body(response).error.code).toBe('ACCOUNT_BLOCKED');
    expect(body(response).error.message).toBe(
      'Sua conta está bloqueada. Entre em contato com o administrador.',
    );
  });
});

describe('identidade que não pode ser aceita', () => {
  it('token que o Supabase não reconhece é 401, e nenhuma conta é criada', async () => {
    const response = await googleLogin('token-inventado-pelo-navegador-0000');

    expect(response.statusCode).toBe(401);
    expect(await prisma.user.count()).toBe(0);
  });

  it('e-mail não verificado pelo Google não é aceito', async () => {
    const token = googleAccount({ id: ID_JOAO, email: 'joao@gmail.com', emailVerified: false });
    await createUser(app, { role: 'ADMIN', email: 'joao@gmail.com' });

    const response = await googleLogin(token);

    expect(response.statusCode).toBe(403);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'joao@gmail.com' } });
    expect(user.authUserId).toBeNull();
  });

  it('identidade que não veio do Google é recusada', async () => {
    const token = googleAccount({ id: ID_JOAO, email: 'joao@gmail.com', provider: 'email' });

    const response = await googleLogin(token);

    expect(response.statusCode).toBe(403);
    expect(await prisma.user.count()).toBe(0);
  });

  it('foto fora do domínio do Google é descartada', async () => {
    const token = googleAccount({
      id: ID_JOAO,
      email: 'joao@gmail.com',
      avatar: 'https://site-qualquer.example/rastreador.png',
    });

    await googleLogin(token);

    const user = await prisma.user.findUniqueOrThrow({ where: { authUserId: ID_JOAO } });
    expect(user.avatarUrl).toBeNull();
  });

  it('Supabase fora do ar: 503 com mensagem amigável', async () => {
    supabaseDown = true;

    const response = await googleLogin(googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' }));

    expect(response.statusCode).toBe(503);
    expect(body(response).error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(body(response))).not.toMatch(/fetch failed|stack/i);
  });

  it('corpo sem token é recusado na validação, sem chamar o Supabase', async () => {
    const response = await request(app, 'POST', '/api/auth/google', null, {});

    expect(response.statusCode).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('conta que entra só com o Google', () => {
  async function activeGoogleOnlyUser() {
    const token = googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' });
    await googleLogin(token);
    await prisma.user.update({ where: { authUserId: ID_JOAO }, data: { status: 'ACTIVE' } });
    const session = body(await googleLogin(token)).data;
    return session as { token: string };
  }

  it('não entra por e-mail e senha — com a mesma resposta de senha errada', async () => {
    await activeGoogleOnlyUser();

    const response = await request(app, 'POST', '/api/auth/login', null, {
      email: 'joao@gmail.com',
      password: 'qualquer-coisa-123',
    });

    expect(response.statusCode).toBe(401);
    expect(body(response).error.message).toBe('E-mail ou senha incorretos.');
  });

  it('não "troca" uma senha que não existe', async () => {
    const session = await activeGoogleOnlyUser();

    const response = await request(app, 'POST', '/api/users/me/password', session.token, {
      currentPassword: 'qualquer-coisa-123',
      newPassword: 'Nova@Senha2026',
      confirmPassword: 'Nova@Senha2026',
    });

    expect(response.statusCode).toBe(422);
    expect(body(response).error.message).toMatch(/entra com o Google/);
  });
});

describe('aprovação e bloqueio pelo administrador', () => {
  it('lista quem está aguardando aprovação', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    await googleLogin(googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' }));

    const response = await request(app, 'GET', '/api/users?status=PENDING', admin.token);

    expect(response.statusCode).toBe(200);
    const items = body(response).data.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ email: 'joao@gmail.com', status: 'PENDING', googleLinked: true });
    expect(items[0]).not.toHaveProperty('authUserId');
    expect(items[0]).not.toHaveProperty('password');
  });

  it('funcionário não aprova ninguém', async () => {
    const employee = await createUser(app);
    await googleLogin(googleAccount({ id: ID_JOAO, email: 'joao@gmail.com' }));
    const pending = await prisma.user.findUniqueOrThrow({ where: { authUserId: ID_JOAO } });

    const response = await request(app, 'PATCH', `/api/users/${pending.id}/status`, employee.token, {
      status: 'ACTIVE',
    });

    expect(response.statusCode).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe(
      'PENDING',
    );
  });

  it('bloquear encerra na hora a sessão de quem estava logado', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const employee = await createUser(app);

    const block = await request(app, 'PATCH', `/api/users/${employee.id}/status`, admin.token, {
      status: 'BLOCKED',
    });
    expect(block.statusCode).toBe(200);

    const response = await request(app, 'GET', '/api/clients', employee.token);
    expect(response.statusCode).toBe(401);
  });

  it('"PENDING" não é uma situação que o administrador possa atribuir', async () => {
    const admin = await createUser(app, { role: 'ADMIN' });
    const employee = await createUser(app);

    const response = await request(app, 'PATCH', `/api/users/${employee.id}/status`, admin.token, {
      status: 'PENDING',
    });

    expect(response.statusCode).toBe(422);
  });
});
