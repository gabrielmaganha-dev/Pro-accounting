import { type Prisma, UserRole } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { AppError } from '../utils/app-error.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../utils/password.js';
import type {
  ChangePasswordInput,
  CreateUserInput,
  ListUsersQuery,
  UpdateOwnProfileInput,
  UpdateUserInput,
} from '../validators/user.validator.js';

/**
 * RECORTE ÚNICO DE LEITURA DE USUÁRIO.
 *
 * Toda consulta deste módulo usa esta constante. É a garantia mecânica de que
 * o hash da senha nunca sai da API: não existe um `findMany` sem `select` em
 * lugar nenhum, então não há como esquecer de excluir o campo — o padrão do
 * Prisma é devolver a linha inteira, e é esse padrão que produz vazamento de
 * hash em código escrito às pressas.
 *
 * `password` não aparece aqui e não deve ser acrescentado por conveniência.
 * Quando o hash é necessário (login, troca de senha), a consulta pede o campo
 * explicitamente, isolada, e descarta o resultado em seguida.
 */
export const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Travas contra auto-bloqueio
// ---------------------------------------------------------------------------

/**
 * POR QUE ESTAS TRAVAS EXISTEM.
 *
 * O módulo de usuários é o único do sistema em que um erro do administrador é
 * IRREVERSÍVEL pela própria interface: quem se rebaixa a funcionário perde, no
 * mesmo clique, a permissão de se promover de volta. A partir daí o conserto é
 * um UPDATE manual no banco.
 *
 * São duas travas distintas, e as duas são necessárias:
 *
 *  1. sobre SI MESMO — evita o tiro no próprio pé mesmo havendo outros
 *     administradores. Custa nada e elimina a categoria inteira de acidente.
 *  2. sobre o ÚLTIMO administrador ativo — evita o sistema ficar sem ninguém
 *     que possa gerenciar usuários. Esta é a que de fato inutiliza o sistema, e
 *     pega o caso em que o administrador A desativa o B sem lembrar que ele
 *     próprio já havia sido rebaixado.
 */

/**
 * Executa uma escrita e a DESFAZ se o sistema ficar sem administrador ativo.
 *
 * A verificação é POSTERIOR à escrita, dentro da mesma transação, e não
 * anterior. A diferença importa: uma checagem prévia do tipo "o alvo é o
 * último administrador?" nunca dispararia, porque quem chama já é,
 * obrigatoriamente, um administrador ativo diferente do alvo — os guards de
 * rota e o `assertNotSelf` garantem isso. Ela seria código morto se
 * disfarçando de rede de proteção.
 *
 * Verificando depois, a condição testada é a que realmente interessa —
 * "sobrou alguém?" — e passa a cobrir o caso que a checagem prévia deixava
 * passar: dois administradores se rebaixando ao mesmo tempo, cada um vendo o
 * outro ainda como administrador.
 *
 * LIMITE CONHECIDO: sob READ COMMITTED (o padrão do PostgreSQL) resta uma
 * janela em que as duas transações contam antes de qualquer uma confirmar.
 * Fechá-la exigiria isolamento serializável ou travar as linhas de
 * administrador, e o custo não se justifica num escritório onde essas
 * operações são raras e feitas por uma pessoa de cada vez. O que este guard
 * garante é que o caminho sequencial — o real — nunca zera os administradores.
 */
async function withActiveAdminGuarantee<T>(
  action: string,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await write(tx);

    const remaining = await tx.user.count({
      where: { role: UserRole.ADMIN, active: true },
    });

    if (remaining === 0) {
      // Lançar aqui desfaz a escrita: é a transação que garante o retorno ao
      // estado anterior, não uma correção manual depois.
      throw AppError.conflict(
        'Esta operação deixaria o sistema sem nenhum administrador ativo, e a partir ' +
          'daí ninguém poderia gerenciar usuários nem ver o financeiro. Promova outro ' +
          'usuário a administrador antes de ' +
          action +
          '.',
      );
    }

    return result;
  });
}

/** Recusa a operação quando o alvo é o próprio usuário autenticado. */
function assertNotSelf(targetId: string, actor: AuthenticatedUser, message: string): void {
  if (targetId === actor.id) {
    throw AppError.forbidden(message);
  }
}

// ---------------------------------------------------------------------------
// Listagem e detalhe
// ---------------------------------------------------------------------------

export async function listUsers(query: ListUsersQuery): Promise<PaginatedResult<PublicUser>> {
  const where = buildWhere(query);

  const [total, items] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { [query.sort]: query.order },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

function buildWhere(query: ListUsersQuery): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  if (query.role) where.role = query.role;
  if (query.status) where.active = query.status === 'active';

  if (query.search) {
    const term = query.search.trim();

    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id }, select: USER_SELECT });

  if (!user) {
    throw AppError.notFound('Usuário não encontrado.');
  }

  return user;
}

/**
 * Unicidade de e-mail conferida antes de gravar.
 *
 * A constraint do banco continua sendo a autoridade final — esta checagem
 * existe para devolver "Já existe um usuário com este e-mail" em vez do erro
 * P2002 cru do Prisma, que chegaria à tela como falha interna.
 */
async function assertEmailIsFree(email: string, exceptId?: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing && existing.id !== exceptId) {
    throw AppError.conflict('Já existe um usuário cadastrado com este e-mail.');
  }
}

// ---------------------------------------------------------------------------
// Criação e atualização de cadastro
// ---------------------------------------------------------------------------

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  await assertEmailIsFree(input.email);

  const password = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      active: input.active,
      password,
      // A senha inicial foi escolhida por um administrador, que portanto a
      // conhece. A conta nasce marcada para troca no primeiro acesso pelo
      // mesmo motivo que uma senha de reset nasce: senha compartilhada não
      // identifica ninguém, e este sistema registra "quem lançou este
      // pagamento" em cada recebimento.
      mustChangePassword: true,
    },
    select: USER_SELECT,
  });
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<PublicUser> {
  const user = await getUserById(id);

  if (input.email && input.email !== user.email) {
    await assertEmailIsFree(input.email, id);
  }

  return prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    },
    select: USER_SELECT,
  });
}

// ---------------------------------------------------------------------------
// Perfil de acesso e situação
// ---------------------------------------------------------------------------

export async function setUserRole(
  id: string,
  role: UserRole,
  actor: AuthenticatedUser,
): Promise<PublicUser> {
  assertNotSelf(
    id,
    actor,
    'Você não pode alterar o próprio perfil de acesso. Peça a outro administrador.',
  );

  const user = await getUserById(id);

  if (user.role === role) return user;

  return withActiveAdminGuarantee('rebaixar este usuário', (tx) =>
    tx.user.update({ where: { id }, data: { role }, select: USER_SELECT }),
  );
}

export async function setUserStatus(
  id: string,
  active: boolean,
  actor: AuthenticatedUser,
): Promise<PublicUser> {
  assertNotSelf(id, actor, 'Você não pode desativar a própria conta.');

  const user = await getUserById(id);

  if (user.active === active) return user;

  return withActiveAdminGuarantee('desativar este usuário', (tx) =>
    tx.user.update({
      where: { id },
      data: {
        active,
        // Desativar precisa cortar o acesso AGORA. Sem isto, quem já estava
        // logado seguiria trabalhando até o token expirar — podendo lançar
        // pagamentos horas depois de ter sido desligado.
        ...(active ? {} : { passwordChangedAt: new Date() }),
      },
      select: USER_SELECT,
    }),
  );
}

// ---------------------------------------------------------------------------
// Reset de acesso e troca da própria senha
// ---------------------------------------------------------------------------

export interface ResetPasswordResult {
  user: PublicUser;
  /**
   * Senha provisória em texto puro.
   *
   * ESTA É A ÚNICA VEZ que ela existe fora da cabeça de quem a receber: não é
   * gravada, não vai para log e não há rota que a recupere. Perdida, refaz-se
   * o reset.
   */
  temporaryPassword: string;
}

export async function resetUserPassword(
  id: string,
  actor: AuthenticatedUser,
): Promise<ResetPasswordResult> {
  // O administrador troca a PRÓPRIA senha pela rota de troca, informando a
  // atual. Passar pelo reset seria trocar a própria senha sem provar que
  // conhece a anterior — exatamente o que a rota de troca impede.
  assertNotSelf(
    id,
    actor,
    'Para alterar a sua própria senha use "Alterar senha", informando a senha atual.',
  );

  await getUserById(id);

  const temporaryPassword = generateTemporaryPassword();

  const user = await prisma.user.update({
    where: { id },
    data: {
      password: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      // Invalida os tokens já emitidos. Um reset é feito justamente quando se
      // suspeita que a conta está em mãos erradas; deixar a sessão do invasor
      // viva por mais um dia esvaziaria a operação.
      passwordChangedAt: new Date(),
    },
    select: USER_SELECT,
  });

  return { user, temporaryPassword };
}

/**
 * Edição do próprio cadastro — nome e e-mail.
 *
 * Trocar o E-MAIL exige a senha atual; trocar só o nome, não. O e-mail é a
 * credencial de login: mudá-lo redireciona a conta. Um notebook destravado por
 * dois minutos bastaria para alguém apontar a conta para um endereço próprio e,
 * de lá, pedir um reset de acesso — a senha atual é o que fecha esse caminho.
 *
 * A sessão NÃO é invalidada aqui, e isso é deliberado: nem o nome nem o e-mail
 * são usados para autorizar coisa alguma. O `authMiddleware` relê o usuário do
 * banco a cada requisição, então o token continua identificando a pessoa certa
 * mesmo carregando o nome antigo no payload. Quem invalida sessão é a troca de
 * senha, o reset e a desativação — as três operações que mexem em credencial.
 */
export async function updateOwnProfile(
  actor: AuthenticatedUser,
  input: UpdateOwnProfileInput,
): Promise<PublicUser> {
  const current = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, email: true, password: true },
  });

  if (!current) {
    throw AppError.unauthorized('Sessão expirada. Faça login novamente.');
  }

  const emailChanged = input.email !== current.email;

  if (emailChanged) {
    if (!input.currentPassword) {
      throw AppError.validation(
        'Para alterar o e-mail de acesso, confirme a sua senha atual.',
        [{ field: 'currentPassword', message: 'Informe a senha atual.' }],
      );
    }

    const matches = await verifyPassword(input.currentPassword, current.password);

    if (!matches) {
      throw AppError.unauthorized('A senha atual está incorreta.');
    }

    await assertEmailIsFree(input.email, actor.id);
  }

  return prisma.user.update({
    where: { id: actor.id },
    data: { name: input.name, email: input.email },
    select: USER_SELECT,
  });
}

export async function changeOwnPassword(
  actor: AuthenticatedUser,
  input: ChangePasswordInput,
): Promise<PublicUser> {
  // Única consulta do módulo que pede o hash — e ele não sai desta função.
  const stored = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, password: true },
  });

  if (!stored) {
    throw AppError.unauthorized('Sessão expirada. Faça login novamente.');
  }

  const matches = await verifyPassword(input.currentPassword, stored.password);

  if (!matches) {
    throw AppError.unauthorized('A senha atual está incorreta.');
  }

  return prisma.user.update({
    where: { id: actor.id },
    data: {
      password: await hashPassword(input.newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
    select: USER_SELECT,
  });
}

// ---------------------------------------------------------------------------
// Exclusão
// ---------------------------------------------------------------------------

/**
 * Exclusão definitiva — deliberadamente estreita.
 *
 * Um usuário que já registrou pagamento ou editou cadastro NÃO pode ser
 * excluído: o pagamento guarda "quem registrou" como exigência de auditoria, e
 * o banco reforça isso com `onDelete: Restrict`. Sem a checagem abaixo o
 * pedido morreria numa violação de chave estrangeira e o administrador leria
 * um erro interno, em vez de "este usuário registrou 12 pagamentos; inative-o".
 *
 * Na prática a exclusão só serve para desfazer um cadastro recém-criado por
 * engano. Para todo o resto existe a inativação, que preserva o histórico.
 */
export async function deleteUser(id: string, actor: AuthenticatedUser): Promise<void> {
  assertNotSelf(id, actor, 'Você não pode excluir a própria conta.');

  await getUserById(id);

  const [payments, clientEvents, invoiceEvents] = await prisma.$transaction([
    prisma.payment.count({ where: { registeredBy: id } }),
    prisma.clientHistory.count({ where: { userId: id } }),
    prisma.invoiceHistory.count({ where: { userId: id } }),
  ]);

  if (payments > 0) {
    throw AppError.conflict(
      'Este usuário registrou ' +
        payments +
        (payments === 1 ? ' pagamento' : ' pagamentos') +
        ' e não pode ser excluído. Inative a conta para bloquear o acesso sem ' +
        'apagar o histórico financeiro.',
    );
  }

  if (clientEvents + invoiceEvents > 0) {
    throw AppError.conflict(
      'Este usuário tem alterações registradas no histórico de clientes ou faturas ' +
        'e não pode ser excluído. Inative a conta para bloquear o acesso sem apagar ' +
        'a auditoria.',
    );
  }

  await withActiveAdminGuarantee('excluir este usuário', (tx) =>
    tx.user.delete({ where: { id }, select: { id: true } }),
  );
}
