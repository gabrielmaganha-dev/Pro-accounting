import { z } from 'zod';

/**
 * Schemas de entrada das rotas de autenticação.
 *
 * As mensagens são escritas em português e voltadas ao usuário final: elas
 * aparecem literalmente abaixo do campo no formulário de login.
 */

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Informe o e-mail.' })
    .trim()
    .min(1, 'Informe o e-mail.')
    .email('Informe um e-mail válido.')
    // Normaliza para minúsculas: o e-mail é gravado em minúsculas no banco, e
    // sem isto "Admin@empresa.com" não encontraria o usuário cadastrado.
    .toLowerCase(),

  password: z
    .string({ required_error: 'Informe a senha.' })
    .min(1, 'Informe a senha.')
    // Limite superior para não entregar ao bcrypt uma string de megabytes:
    // o custo do hash cresce com o tamanho da entrada e viraria um vetor de DoS.
    .max(128, 'Senha longa demais.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Login com Google: o token de acesso do Supabase Auth obtido pela interface
 * ao fim do fluxo OAuth. Só formato aqui — a validade é decidida pelo próprio
 * Supabase (ver google-identity.service.ts).
 */
export const googleLoginSchema = z.object({
  accessToken: z
    .string({ required_error: 'Token de acesso ausente.' })
    .trim()
    .min(20, 'Token de acesso inválido.')
    .max(8192, 'Token de acesso inválido.'),
});

export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
