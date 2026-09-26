import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/prisma.js';
import { verifyPassword } from '../../src/utils/password.js';
import { body, createTestApp, createUser, DEFAULT_PASSWORD, request } from '../helpers.js';

/**
 * Login e sessão.
 *
 * Um app novo por teste: o limite de 10 logins por minuto é guardado em
 * memória na instância, e testes que compartilhassem a mesma instância
 * esbarrariam no limite uns dos outros.
 */
let app: FastifyInstance;

beforeEach(async () => {
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

function login(email: string, password: string) {
  return request(app, 'POST', '/api/auth/login', null, { email, password });
}

describe('POST /api/auth/login', () => {
  it('autentica com credenciais corretas e devolve token e usuário', async () => {
    const user = await createUser(app, { role: 'ADMIN', email: 'admin@teste.com.br' });

    const response = await login('admin@teste.com.br', DEFAULT_PASSWORD);

    expect(response.statusCode).toBe(200);
    const { data } = body(response);
    expect(data.token).toEqual(expect.any(String));
    expect(data.expiresIn).toBe('1h');
    expect(data.user).toEqual({
      id: user.id,
      name: user.name,
      email: 'admin@teste.com.br',
      role: 'ADMIN',
    });
  });

  it('nunca devolve o hash da senha', async () => {
    await createUser(app, { email: 'func@teste.com.br' });

    const response = await login('func@teste.com.br', DEFAULT_PASSWORD);

    expect(response.body).not.toContain('password');
    expect(response.body).not.toMatch(/\$2[aby]\$/);
  });

  it('ignora maiúsculas e espaços no e-mail', async () => {
    await createUser(app, { email: 'maria@teste.com.br' });

    const response = await login('  Maria@TESTE.com.br ', DEFAULT_PASSWORD);

    expect(response.statusCode).toBe(200);
  });

  it('senha errada e e-mail inexistente recebem a MESMA resposta (sem enumeração)', async () => {
    await createUser(app, { email: 'joao@teste.com.br' });

    const wrongPassword = await login('joao@teste.com.br', 'senha-errada');
    const unknownEmail = await login('ninguem@teste.com.br', 'senha-errada');

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(body(wrongPassword).error).toEqual(body(unknownEmail).error);
    expect(body(wrongPassword).error.message).toBe('E-mail ou senha incorretos.');
  });

  it('usuário desativado com senha correta é barrado com 403', async () => {
    await createUser(app, { email: 'inativo@teste.com.br', active: false });

    const response = await login('inativo@teste.com.br', DEFAULT_PASSWORD);

    expect(response.statusCode).toBe(403);
    expect(body(response).error.code).toBe('FORBIDDEN');
  });

  it('usuário desativado com senha ERRADA recebe 401, sem revelar que a conta existe', async () => {
    await createUser(app, { email: 'inativo2@teste.com.br', active: false });

    const response = await login('inativo2@teste.com.br', 'senha-errada');

    expect(response.statusCode).toBe(401);
  });

  it('valida o corpo e aponta o campo com problema', async () => {
    const response = await login('nao-e-email', '');

    expect(response.statusCode).toBe(422);
    const fields = body(response).error.issues.map((issue: { field: string }) => issue.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('recusa JSON malformado com mensagem clara', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": ',
    });

    expect(response.statusCode).toBe(400);
    expect(body(response).error.message).toMatch(/JSON está malformado/);
  });

  it('limita tentativas de login por minuto (força bruta)', async () => {
    const attempts = [];
    for (let index = 0; index < 11; index += 1) {
      attempts.push(await login('alvo@teste.com.br', `tentativa-${index}`));
    }

    expect(attempts.slice(0, 10).every((response) => response.statusCode === 401)).toBe(true);
    expect(attempts[10]?.statusCode).toBe(429);
    expect(body(attempts[10]!).error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('GET /api/auth/me', () => {
  it('devolve o usuário da sessão', async () => {
    const user = await createUser(app, { role: 'EMPLOYEE' });

    const response = await request(app, 'GET', '/api/auth/me', user.token);

    expect(response.statusCode).toBe(200);
    expect(body(response).data.user).toMatchObject({ id: user.id, role: 'EMPLOYEE' });
  });

  it('exige token', async () => {
    const response = await request(app, 'GET', '/api/auth/me', null);

    expect(response.statusCode).toBe(401);
    expect(body(response).error.code).toBe('UNAUTHORIZED');
  });

  it('recusa token assinado com outro segredo', async () => {
    const forged = app.jwt.sign(
      { sub: 'x', name: 'x', email: 'x@x.com', role: 'ADMIN' },
      { key: 'um-segredo-completamente-diferente-com-32-chars' },
    );

    const response = await request(app, 'GET', '/api/auth/me', forged);

    expect(response.statusCode).toBe(401);
  });

  it('recusa token sem assinatura (alg: none)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'x', name: 'x', email: 'x@x.com', role: 'ADMIN' }),
    ).toString('base64url');

    const response = await request(app, 'GET', '/api/auth/me', `${header}.${payload}.`);

    expect(response.statusCode).toBe(401);
  });

  it('recusa token expirado', async () => {
    const user = await createUser(app);
    const expired = app.jwt.sign(
      { sub: user.id, name: user.name, email: user.email, role: user.role },
      { expiresIn: '1s' },
    );

    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const response = await request(app, 'GET', '/api/auth/me', expired);

    expect(response.statusCode).toBe(401);
  });

  it('usuário desativado perde o acesso NA HORA, mesmo com token válido', async () => {
    const user = await createUser(app);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });

    const response = await request(app, 'GET', '/api/auth/me', user.token);

    expect(response.statusCode).toBe(403);
  });

  it('usuário removido do banco não autentica mais', async () => {
    const user = await createUser(app);
    await prisma.user.delete({ where: { id: user.id } });

    const response = await request(app, 'GET', '/api/auth/me', user.token);

    expect(response.statusCode).toBe(401);
  });

  it('o perfil vem do BANCO, não do token: rebaixar o usuário vale imediatamente', async () => {
    const user = await createUser(app, { role: 'ADMIN' });
    await prisma.user.update({ where: { id: user.id }, data: { role: 'EMPLOYEE' } });

    const me = await request(app, 'GET', '/api/auth/me', user.token);
    const finance = await request(app, 'GET', '/api/finance/overview', user.token);

    expect(body(me).data.user.role).toBe('EMPLOYEE');
    expect(finance.statusCode).toBe(403);
  });
});

describe('usuários', () => {
  it('a senha é gravada com hash bcrypt, nunca em texto puro', async () => {
    const user = await createUser(app, { password: 'MinhaSenha#2026' });

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(stored.password).not.toBe('MinhaSenha#2026');
    expect(stored.password).toMatch(/^\$2[aby]\$10\$/);
    expect(await verifyPassword('MinhaSenha#2026', stored.password)).toBe(true);
    expect(await verifyPassword('outra', stored.password)).toBe(false);
  });

  it('o e-mail é único', async () => {
    await createUser(app, { email: 'repetido@teste.com.br' });

    await expect(createUser(app, { email: 'repetido@teste.com.br' })).rejects.toThrow();
  });

  it('usuário com pagamentos lançados não pode ser excluído (auditoria)', async () => {
    const user = await createUser(app, { role: 'ADMIN' });
    const client = await prisma.client.create({
      data: { name: 'Cliente', cpfCnpj: '52998224725' },
    });
    const invoice = await prisma.invoice.create({
      data: {
        clientId: client.id,
        number: 'FAT-AUD-1',
        amount: 100,
        issueDate: new Date('2026-01-01'),
        dueDate: new Date('2026-01-10'),
      },
    });
    await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: 100,
        paymentDate: new Date('2026-01-05'),
        paymentMethod: 'PIX',
        registeredBy: user.id,
      },
    });

    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow();
  });
});

describe('infraestrutura', () => {
  it('health check responde e confirma o banco', async () => {
    const response = await request(app, 'GET', '/api/health', null);

    expect(response.statusCode).toBe(200);
    expect(body(response)).toMatchObject({ status: 'ok', database: 'connected' });
  });

  it('rota inexistente devolve 404 no envelope padrão', async () => {
    const response = await request(app, 'GET', '/api/nao-existe', null);

    expect(response.statusCode).toBe(404);
    expect(body(response)).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('envia cabeçalhos de segurança', async () => {
    const response = await request(app, 'GET', '/api/health', null);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('CORS libera a origem do frontend e ignora origens desconhecidas', async () => {
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://localhost:5173' },
    });
    const denied = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://site-malicioso.example' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
