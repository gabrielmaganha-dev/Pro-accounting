import { type Prisma, UserRole, UserStatus } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import type { AuthenticatedUser, JwtPayload } from '../types/auth.js';
import { AppError } from '../utils/app-error.js';
import { simulatePasswordVerification, verifyPassword } from '../utils/password.js';
import type { LoginInput } from '../validators/auth.validator.js';
import type { GoogleIdentity } from './google-identity.service.js';

export interface LoginResult {
  token: string;
  /** Validade do token, no mesmo formato configurado em JWT_EXPIRES_IN. */
  expiresIn: string;
  user: AuthenticatedUser;
}

/**
 * Mensagem única para e-mail inexistente E senha errada.
 *
 * Distinguir os dois casos ("e-mail não cadastrado" vs "senha incorreta")
 * transforma o login num verificador de quais e-mails existem no sistema.
 */
const INVALID_CREDENTIALS = 'E-mail ou senha incorretos.';

/** Campos de que o login precisa para decidir e para montar a sessão. */
const SESSION_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  mustChangePassword: true,
  avatarUrl: true,
  password: true,
  authUserId: true,
} as const satisfies Prisma.UserSelect;

type SessionUserRow = Prisma.UserGetPayload<{ select: typeof SESSION_USER_SELECT }>;

export async function login(app: FastifyInstance, input: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: SESSION_USER_SELECT,
  });

  // Conta inexistente e conta SEM senha local (entra só com o Google) recebem
  // a mesma resposta, no mesmo tempo, que uma senha errada: o login não pode
  // revelar quais e-mails existem nem como cada conta entra.
  if (!user || user.password === null) {
    await simulatePasswordVerification(input.password);
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  const passwordMatches = await verifyPassword(input.password, user.password);

  if (!passwordMatches) {
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  // A checagem da situação vem DEPOIS da senha de propósito: se viesse antes,
  // qualquer pessoa descobriria contas bloqueadas ou pendentes sem saber a
  // senha.
  assertCanSignIn(user.status);

  return issueSession(app, toAuthenticatedUser(user));
}

/**
 * Só ACTIVE entra. As mensagens de PENDING e BLOCKED são as que a pessoa vê
 * na tela de login — e só aparecem para quem já provou ser o dono da conta
 * (senha certa ou identidade Google confirmada).
 */
export function assertCanSignIn(status: UserStatus): void {
  if (status === UserStatus.PENDING) throw AppError.accountPending();
  if (status === UserStatus.BLOCKED) throw AppError.accountBlocked();
}

// ---------------------------------------------------------------------------
// Login com Google
// ---------------------------------------------------------------------------

export interface GoogleAccountResolution {
  user: AuthenticatedUser & { status: UserStatus };
  /** Conta criada agora, no primeiro acesso com o Google. */
  created: boolean;
  /** Conta que já existia (cadastrada com e-mail e senha) e foi vinculada agora. */
  linked: boolean;
}

/**
 * Encontra — ou cria — a conta do sistema para uma identidade Google já
 * CONFIRMADA no servidor do Supabase (ver google-identity.service.ts).
 *
 * Ordem de busca, e por quê:
 *
 *  1. Pelo vínculo (`authUserId`). É o caminho de todo login depois do
 *     primeiro, e não depende do e-mail — que pode mudar dos dois lados.
 *  2. Pelo e-mail, verificado pelo Google. Encontra a conta que um
 *     administrador cadastrou com e-mail e senha para esta pessoa; ela passa a
 *     entrar dos dois jeitos, com o MESMO cadastro, perfil e histórico — nunca
 *     duas contas para o mesmo e-mail. Se essa conta já estiver vinculada a
 *     OUTRA identidade Google, nada é feito: um administrador precisa decidir.
 *  3. Nenhuma das duas: conta nova, como FUNCIONÁRIO e PENDENTE. Ninguém vira
 *     administrador — nem entra no sistema — só por ter um Gmail; um
 *     administrador aprova o acesso.
 *
 * Tudo numa transação: dois primeiros acessos simultâneos da mesma pessoa não
 * criam duas contas — o segundo esbarra na unicidade de e-mail ou de vínculo e
 * recebe um conflito.
 */
export async function resolveGoogleAccount(
  identity: GoogleIdentity,
): Promise<GoogleAccountResolution> {
  return prisma.$transaction(async (tx) => {
    const byLink = await tx.user.findUnique({
      where: { authUserId: identity.authUserId },
      select: SESSION_USER_SELECT,
    });

    if (byLink) {
      // A foto acompanha o perfil Google. O NOME não: o administrador pode tê-lo
      // corrigido, e o Google não é a fonte da verdade do cadastro.
      const user =
        identity.avatarUrl && identity.avatarUrl !== byLink.avatarUrl
          ? await tx.user.update({
              where: { id: byLink.id },
              data: { avatarUrl: identity.avatarUrl },
              select: SESSION_USER_SELECT,
            })
          : byLink;

      return { user: withStatus(user), created: false, linked: false };
    }

    const byEmail = await tx.user.findUnique({
      where: { email: identity.email },
      select: SESSION_USER_SELECT,
    });

    if (byEmail) {
      if (byEmail.authUserId !== null) {
        throw AppError.conflict(
          'Este e-mail já está vinculado a outra Conta Google. Procure o administrador do sistema.',
        );
      }

      const user = await tx.user.update({
        where: { id: byEmail.id },
        data: {
          authUserId: identity.authUserId,
          ...(identity.avatarUrl ? { avatarUrl: identity.avatarUrl } : {}),
        },
        select: SESSION_USER_SELECT,
      });

      return { user: withStatus(user), created: false, linked: true };
    }

    const user = await tx.user.create({
      data: {
        name: identity.name,
        email: identity.email,
        authUserId: identity.authUserId,
        avatarUrl: identity.avatarUrl,
        password: null,
        role: UserRole.EMPLOYEE,
        status: UserStatus.PENDING,
        mustChangePassword: false,
      },
      select: SESSION_USER_SELECT,
    });

    return { user: withStatus(user), created: true, linked: false };
  });
}

function withStatus(row: SessionUserRow): AuthenticatedUser & { status: UserStatus } {
  return { ...toAuthenticatedUser(row), status: row.status };
}

function toAuthenticatedUser(row: SessionUserRow): AuthenticatedUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    avatarUrl: row.avatarUrl,
    hasPassword: row.password !== null,
  };
}

/**
 * Emite um token para um usuário já autenticado.
 *
 * Existe separada do `login` porque a troca de senha e o login com Google
 * também precisam emitir um. A sessão é UMA SÓ, qualquer que seja o jeito de
 * entrar: o mesmo token, o mesmo middleware, as mesmas regras de bloqueio e de
 * revogação.
 *
 * Na troca de senha ela é indispensável: a troca carimba `passwordChangedAt`,
 * e o token que a pessoa estava usando passa a ser anterior a esse instante —
 * ou seja, é recusado na requisição seguinte. Sem um token novo, trocar a
 * senha derrubaria a própria sessão de quem trocou.
 */
export function issueSession(app: FastifyInstance, user: AuthenticatedUser): LoginResult {
  const payload: JwtPayload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  // A validade vem das opções de `sign` registradas em app.ts (JWT_EXPIRES_IN).
  const token = app.jwt.sign(payload);

  return { token, expiresIn: env.JWT_EXPIRES_IN, user };
}
