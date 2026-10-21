/**
 * Largura e altura de um PNG, lidas do cabeçalho — sem decodificar a imagem.
 *
 * Um PNG válido começa com a assinatura de 8 bytes e, logo em seguida, o bloco
 * IHDR: 4 bytes de tamanho, o nome "IHDR" (bytes 12–15) e a largura (16–19) e
 * a altura (20–23) como inteiros big-endian. O nome é conferido: um arquivo
 * com outro bloco antes do IHDR teria, nos bytes 16–23, um número qualquer — e
 * a checagem de tamanho deixaria passar um PNG enorme. Sem IHDR no lugar
 * certo, devolve `null` e quem chama trata o arquivo como inválido.
 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR = [0x49, 0x48, 0x44, 0x52];

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null;
  if (!IHDR.every((byte, index) => bytes[12 + index] === byte)) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Maior lado aceito para um logo em PNG.
 *
 * A fatura em PDF decodifica o PNG inteiro para embutir a transparência. Medido
 * por fatura: 8000 px levou 7 s e ~590 MB; 4000 px, 2 s e ~330 MB. Com 2000 px
 * o custo cai para um quarto do de 4000, e ainda sobra muito — o logo sai com
 * 2,5 cm de largura na fatura, e 600 dpi nessa largura são 590 px.
 */
export const LOGO_MAX_SIDE_PX = 2000;
