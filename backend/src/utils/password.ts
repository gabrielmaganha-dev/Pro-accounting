import bcrypt from 'bcryptjs';

import { env } from '../config/env.js';

/**
 * Hashing de senhas — isolado neste módulo de propósito.
 *
 * Usamos `bcryptjs` (JavaScript puro) em vez de `bcrypt`/`argon2`, que são
 * módulos nativos e exigem toolchain C++ instalada para compilar quando não há
 * binário pré-compilado para a plataforma. Como o alvo é uma máquina Windows
 * sem build tools, um `npm install` quebrado custaria mais do que o ganho.
 *
 * Migrar para Argon2id depois significa reescrever apenas este arquivo: o
 * resto do sistema só conhece `hashPassword` e `verifyPassword`.
 */

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}

/**
 * Defesa contra enumeração de usuários por tempo de resposta.
 *
 * Sem isto, um login com e-mail inexistente responderia em ~1ms (nenhum hash
 * calculado) e um com e-mail existente em ~250ms (bcrypt rodando). A diferença
 * é mensurável e revela quais e-mails estão cadastrados. Esta função queima o
 * mesmo tempo contra um hash descartável.
 *
 * O hash é gerado uma única vez, sob demanda, e reaproveitado.
 */
let decoyHash: Promise<string> | null = null;

export async function simulatePasswordVerification(plainPassword: string): Promise<void> {
  decoyHash ??= bcrypt.hash('pro-accounting::timing-decoy', env.BCRYPT_SALT_ROUNDS);
  await bcrypt.compare(plainPassword, await decoyHash);
}
