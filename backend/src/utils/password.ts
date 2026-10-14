import { randomBytes } from 'node:crypto';

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

/**
 * Alfabeto da senha temporária.
 *
 * Fora dele: 0/O, 1/l/I e 5/S. Uma senha provisória é ditada por telefone ou
 * copiada de um bilhete — os pares ambíguos transformam "esqueci a senha" em
 * "a senha não funciona", e o administrador refaz o reset sem saber por quê.
 */
const TEMP_PASSWORD_LETTERS = 'abcdefghjkmnpqrtuvwxyz';
const TEMP_PASSWORD_DIGITS = '234679';
const TEMP_PASSWORD_ALPHABET = TEMP_PASSWORD_LETTERS + TEMP_PASSWORD_DIGITS;

/** Blocos de 4 separados por hífen: legível ao ditar e ao digitar. */
const TEMP_PASSWORD_BLOCKS = 3;
const TEMP_PASSWORD_BLOCK_SIZE = 4;

/**
 * Sorteia um índice uniforme em [0, size) a partir de bytes criptográficos.
 *
 * `byte % size` seria enviesado: com 256 bytes possíveis e um alfabeto que não
 * divide 256, os primeiros caracteres sairiam com mais frequência. O descarte
 * abaixo elimina esse viés — importa aqui porque esta senha é a única barreira
 * da conta até a primeira troca.
 */
function randomIndex(size: number): number {
  const limit = Math.floor(256 / size) * size;

  for (;;) {
    const [byte] = randomBytes(1);
    if (byte !== undefined && byte < limit) return byte % size;
  }
}

function randomChar(alphabet: string): string {
  return alphabet[randomIndex(alphabet.length)] as string;
}

/**
 * Senha temporária de uso único, entregue ao administrador no reset de acesso.
 *
 * Nunca é persistida em texto puro nem registrada em log: o retorno desta
 * função é hasheado imediatamente e a única cópia legível aparece uma vez na
 * resposta HTTP do reset. Se o administrador perder, refaz o reset.
 *
 * A composição é forçada a ter letra E dígito para satisfazer a mesma política
 * exigida do usuário final — uma senha gerada pelo sistema que a própria API
 * recusaria seria uma contradição embaraçosa.
 */
export function generateTemporaryPassword(): string {
  const total = TEMP_PASSWORD_BLOCKS * TEMP_PASSWORD_BLOCK_SIZE;

  const chars = Array.from({ length: total }, () => randomChar(TEMP_PASSWORD_ALPHABET));

  // Garante ao menos uma letra e um dígito, em posições sorteadas.
  const letterAt = randomIndex(total);
  let digitAt = randomIndex(total);
  if (digitAt === letterAt) digitAt = (digitAt + 1) % total;

  chars[letterAt] = randomChar(TEMP_PASSWORD_LETTERS);
  chars[digitAt] = randomChar(TEMP_PASSWORD_DIGITS);

  const blocks: string[] = [];
  for (let index = 0; index < total; index += TEMP_PASSWORD_BLOCK_SIZE) {
    blocks.push(chars.slice(index, index + TEMP_PASSWORD_BLOCK_SIZE).join(''));
  }

  return blocks.join('-');
}
