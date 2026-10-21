/**
 * Regenera backend/src/documents/default-logo.ts a partir de
 * frontend/src/assets/logo.png.
 *
 * A fatura em PDF é desenhada no servidor, que não enxerga os arquivos do
 * frontend; por isso ela leva uma cópia do logo padrão em base64. Rode este
 * script sempre que trocar o logo.png (ver frontend/src/assets/LOGO.md):
 *
 *   node scripts/sync-default-logo.mjs
 *
 * O teste backend/tests/unit/invoice-pdf.test.ts falha enquanto as duas cópias
 * forem diferentes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = fileURLToPath(new URL('frontend/src/assets/logo.png', root));
const target = fileURLToPath(new URL('backend/src/documents/default-logo.ts', root));

const lines = readFileSync(source).toString('base64').match(/.{1,96}/g) ?? [];

const content = [
  '/**',
  ' * Logotipo padrão de fábrica, em base64, para a fatura em PDF.',
  ' *',
  ' * É uma cópia de `frontend/src/assets/logo.png`: a fatura usa este arquivo',
  ' * quando nenhum logo foi enviado em Configurações, como a interface faz. A cópia',
  ' * existe porque o servidor não tem acesso aos arquivos do frontend — nem na',
  ' * função da Vercel nem no container do backend.',
  ' *',
  ' * Gerado por `node scripts/sync-default-logo.mjs` — não edite à mão. O teste',
  ' * tests/unit/invoice-pdf.test.ts falha se as duas cópias divergirem.',
  ' */',
  'export const DEFAULT_LOGO_PNG_BASE64 = [',
  ...lines.map((line) => `  '${line}',`),
  "].join('');",
  '',
].join('\n');

writeFileSync(target, content);
console.info(`default-logo.ts atualizado (${lines.length} linhas de base64).`);
