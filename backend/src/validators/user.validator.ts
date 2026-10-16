import { z } from 'zod';

/**
 * Schemas de entrada do módulo de usuários.
 *
 * Duas regras atravessam o arquivo inteiro:
 *
 *  • `password` só aparece na CRIAÇÃO e na TROCA. Nunca em atualização de
 *    cadastro. Se `updateUserSchema` aceitasse senha, um administrador
 *    trocaria a senha de outra pessoa sem deixar o rastro que o reset deixa —
 *    e sem a marcação de senha temporária que obriga a troca depois.
 *
 *  • `role` e `active` têm rotas próprias, e por isso NÃO entram no corpo de
 *    atualização. Fosse diferente, `PUT /users/:id` viraria uma porta lateral
 *    para promover alguém a administrador — o mesmo tipo de brecha que já foi
 *    fechada no módulo de clientes.
 */

const nameSchema = z
  .string({ required_error: 'Informe o nome.' })
  .trim()
  .min(3, 'O nome precisa ter ao menos 3 caracteres.')
  .max(120, 'Máximo de 120 caracteres.');

const emailSchema = z
  .string({ required_error: 'Informe o e-mail.' })
  .trim()
  .min(1, 'Informe o e-mail.')
  .email('Informe um e-mail válido.')
  // Minúsculas sempre: o banco grava assim, e sem isto "Maria@x.com" e
  // "maria@x.com" seriam duas contas para a mesma pessoa.
  .toLowerCase()
  .max(180, 'Máximo de 180 caracteres.');

const roleSchema = z.enum(['ADMIN', 'EMPLOYEE'], {
  required_error: 'Informe o perfil de acesso.',
  invalid_type_error: 'Perfil inválido.',
});

/**
 * Política de senha.
 *
 * Mínimo de 8 com letra e dígito. Não exigimos símbolo nem maiúscula: as
 * evidências de uso real mostram que regras de composição agressivas empurram
 * as pessoas para `Senha@2024` e para o post-it no monitor. O limite superior
 * de 128 protege o bcrypt de receber uma string enorme como vetor de DoS —
 * o mesmo teto já aplicado no login.
 */
export const passwordSchema = z
  .string({ required_error: 'Informe a senha.' })
  .min(8, 'A senha precisa ter ao menos 8 caracteres.')
  .max(128, 'Senha longa demais (máximo de 128 caracteres).')
  .refine((value) => /[a-zA-Z]/.test(value), {
    message: 'A senha precisa ter ao menos uma letra.',
  })
  .refine((value) => /\d/.test(value), {
    message: 'A senha precisa ter ao menos um número.',
  });

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema.default('EMPLOYEE'),
  password: passwordSchema,
  /// Ausente = conta já nasce ativa, que é o caso comum. PENDING não se
  /// escolhe: é o estado de quem se cadastrou sozinho, pelo Google.
  status: z.enum(['ACTIVE', 'BLOCKED']).default('ACTIVE'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Atualização de cadastro: apenas identificação. Perfil e situação têm rota própria. */
export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.email !== undefined, {
    message: 'Informe ao menos um campo para atualizar.',
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateUserRoleSchema = z.object({
  role: roleSchema,
});

/**
 * Aprovar ou desbloquear (ACTIVE) e bloquear (BLOCKED). PENDING não é destino
 * de nenhuma ação: é só o estado de quem acabou de se cadastrar.
 */
export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'BLOCKED'], {
    required_error: 'Informe a nova situação.',
    invalid_type_error: 'Situação inválida.',
  }),
});

/**
 * Troca da própria senha.
 *
 * A senha atual é obrigatória mesmo havendo token válido. O token prova que a
 * sessão foi aberta por quem sabia a senha — não que quem está no teclado
 * agora é a mesma pessoa. Sem esta confirmação, um notebook destravado por
 * dois minutos vira uma conta sequestrada.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Informe a senha atual.' })
      .min(1, 'Informe a senha atual.')
      .max(128, 'Senha longa demais.'),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'A nova senha precisa ser diferente da atual.',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Reset de acesso pelo administrador.
 *
 * Sem corpo: quem escolhe a senha é o sistema. Deixar o administrador digitá-la
 * produziria senhas fracas e reaproveitadas ("Mudar@123" para todo mundo), e o
 * administrador continuaria sabendo a senha definitiva de outra pessoa depois
 * que ela voltasse a usar a conta.
 */
export const userIdParamSchema = z.object({
  id: z.string().min(1, 'Identificador inválido.'),
});

export const listUsersQuerySchema = z.object({
  search: z.string().trim().max(180).optional(),
  role: roleSchema.optional(),
  /// Ausente = todas as situações.
  status: z.enum(['ACTIVE', 'PENDING', 'BLOCKED']).optional(),

  sort: z.enum(['name', 'email', 'role', 'createdAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),

  page: z.coerce.number().int().min(1, 'Página inválida.').default(1),
  pageSize: z.coerce.number().int().min(1).max(100, 'Máximo de 100 por página.').default(20),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/**
 * Edição do PRÓPRIO cadastro, pela tela de configurações.
 *
 * Separado de `updateUserSchema` porque a regra é diferente: aqui a senha atual
 * pode ser exigida. Trocar o e-mail é trocar a credencial de acesso — quem
 * encontra um computador destravado não pode redirecionar a conta para um
 * endereço próprio sem provar que sabe a senha. Mudar apenas o nome não tem
 * essa consequência e não pede nada.
 *
 * `role` e `active` continuam de fora, como no schema de administrador: seria
 * inútil fechar a porta da frente e deixar esta aberta.
 */
export const updateOwnProfileSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    currentPassword: z.string().max(128, 'Senha longa demais.').optional(),
  })
  .strict();

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;
