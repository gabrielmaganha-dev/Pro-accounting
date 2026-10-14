import { deflateRawSync } from 'node:zlib';

/**
 * Escritor de ZIP mínimo — a embalagem de um arquivo .xlsx.
 *
 * POR QUE ESCREVER ISTO EM VEZ DE INSTALAR UMA BIBLIOTECA.
 *
 * Um .xlsx é um ZIP com meia dúzia de XMLs dentro. Precisamos de planilha
 * simples: uma aba, cabeçalho, linhas, números que somam. Bibliotecas como a
 * `exceljs` resolvem fórmulas, gráficos, imagens, formatação condicional e
 * validação de dados — nada disso entra aqui, e o custo seria alguns megabytes
 * de dependência e uma superfície de atualização a manter por anos.
 *
 * O ZIP, por outro lado, é um formato estável há trinta anos e cabe nesta
 * página. O Node já traz o `deflate`, que é a única parte não trivial.
 *
 * QUANDO TROCAR POR UMA BIBLIOTECA: se os relatórios passarem a exigir várias
 * abas com referências entre elas, gráficos embutidos ou formatação
 * condicional. Aí a conta se inverte, e o caminho é substituir apenas
 * `formatters/xlsx.ts` — nada fora dele conhece este arquivo.
 */

export interface ZipEntry {
  /** Caminho dentro do arquivo, com barras normais. */
  path: string;
  content: string;
}

/**
 * Tabela de CRC-32, gerada uma vez na primeira utilização.
 *
 * O ZIP guarda o CRC de cada arquivo e os leitores conferem: um CRC errado faz
 * o Excel recusar a planilha inteira com "formato inválido", sem dizer por quê.
 */
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;

  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      // 0xEDB88320 é o polinômio CRC-32 refletido, o mesmo usado por ZIP,
      // gzip e PNG.
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  crcTable = table;
  return table;
}

function crc32(buffer: Buffer): number {
  const table = getCrcTable();
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xff] as number);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Data e hora no formato MS-DOS, que é o que o ZIP guarda.
 *
 * Fixada em 01/01/1980 00:00 — a data mais antiga que o formato representa.
 * Usar o relógio faria dois downloads do MESMO relatório produzirem arquivos
 * diferentes byte a byte, o que atrapalha conferir se um arquivo mudou. O
 * carimbo de quando o relatório foi emitido está impresso na primeira linha da
 * planilha, onde alguém consegue lê-lo.
 */
const DOS_TIME = 0;
const DOS_DATE = 33; // (1980-1980) << 9 | 1 << 5 | 1

/** Constrói o arquivo ZIP completo em memória. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];

  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const raw = Buffer.from(entry.content, 'utf8');
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // assinatura de cabeçalho local
    local.writeUInt16LE(20, 4); // versão necessária: 2.0
    local.writeUInt16LE(0x0800, 6); // sinalizador: nome em UTF-8
    local.writeUInt16LE(8, 8); // método: deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // sem campo extra

    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // assinatura de diretório central
    central.writeUInt16LE(20, 4); // versão que criou
    central.writeUInt16LE(20, 6); // versão necessária
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentário
    central.writeUInt16LE(0, 34); // disco inicial
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(offset, 42); // posição do cabeçalho local

    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centrals);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // fim do diretório central
  end.writeUInt16LE(0, 4); // número do disco
  end.writeUInt16LE(0, 6); // disco do diretório central
  end.writeUInt16LE(entries.length, 8); // entradas neste disco
  end.writeUInt16LE(entries.length, 10); // entradas no total
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16); // onde o diretório central começa
  end.writeUInt16LE(0, 20); // sem comentário

  return Buffer.concat([...locals, centralDirectory, end]);
}

/** Escapa texto para dentro de um atributo ou nó XML. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Caracteres de controle são ilegais em XML 1.0 e fariam o Excel recusar
    // o arquivo inteiro. Não devem aparecer em dado de cadastro, mas um campo
    // de observação colado de outro sistema pode trazê-los.
    //
    // O eslint reclama de caractere de controle em expressão regular porque
    // quase sempre é engano. Aqui é o contrário: eles são justamente o alvo.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}
