import type { Prisma, Settings } from '@prisma/client';

import { prisma } from '../config/prisma.js';
import type { AuthenticatedUser } from '../types/auth.js';
import { applyRuntimeSettings } from '../utils/date.js';
import { requestResweep } from './notification-sweep-state.js';
import type {
  UpdateAppearanceInput,
  UpdateCompanyInput,
  UpdateGeneralInput,
} from '../validators/settings.validator.js';

/**
 * Configuração do sistema.
 *
 * A tabela tem UMA linha, de id fixo. Todo acesso passa por `upsert` nesse id,
 * o que resolve de uma vez dois problemas: a linha nasce sozinha na primeira
 * leitura (sem precisar de seed) e duas escritas simultâneas não conseguem
 * criar configurações concorrentes.
 */

const SINGLETON_ID = 'singleton';

/**
 * Lê a configuração, criando-a com os padrões se ainda não existir.
 *
 * O `create` vazio é intencional: todos os campos têm `@default` no schema, e
 * é lá que os padrões moram. Repeti-los aqui criaria dois lugares para eles
 * divergirem.
 */
export async function getSettings(): Promise<Settings> {
  return prisma.settings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
}

/**
 * Carrega a configuração na subida do servidor.
 *
 * Falha aqui NÃO derruba o processo: o sistema sobe com os padrões de
 * `utils/date.ts` e volta a ler a configuração na primeira escrita. Um banco
 * lento na inicialização não pode ser motivo para a API não abrir a porta —
 * ela ainda vai responder `/health` dizendo que o banco está fora, que é a
 * informação útil.
 */
export async function loadSettingsIntoRuntime(): Promise<void> {
  try {
    const settings = await getSettings();
    applyRuntimeSettings(settings);
  } catch {
    // Silencioso de propósito: o log de erro da inicialização já reporta a
    // falha de conexão, e um segundo aviso sobre o mesmo problema só polui.
  }
}

/** Atualiza a linha única e refresca o cache em memória. */
async function save(data: Prisma.SettingsUpdateInput, actor: AuthenticatedUser) {
  const settings = await prisma.settings.update({
    where: { id: SINGLETON_ID },
    data: { ...data, updatedByUser: { connect: { id: actor.id } } },
  });

  // Sem isto, mudar o fuso ou a antecedência só surtiria efeito no próximo
  // reinício — e o administrador concluiria que o campo não funciona.
  applyRuntimeSettings(settings);

  /**
   * Força a próxima varredura de notificações.
   *
   * A varredura roda no máximo uma vez por minuto. Mudar a antecedência de
   * vencimento muda QUAIS faturas merecem aviso, então sem zerar esse relógio o
   * sino continuaria com a janela antiga por até um minuto — e quem acabou de
   * salvar concluiria que o campo não teve efeito. É o mesmo motivo pelo qual
   * pagamento e estorno chamam isto.
   *
   * Vale para qualquer escrita de configuração, não só a da antecedência: é
   * barato (a varredura é idempotente) e evita depender de alguém lembrar de
   * acrescentar a chamada quando um novo campo passar a influenciar alertas.
   */
  requestResweep();

  return settings;
}

export async function updateCompany(input: UpdateCompanyInput, actor: AuthenticatedUser) {
  await getSettings();
  return save(input, actor);
}

export async function updateAppearance(input: UpdateAppearanceInput, actor: AuthenticatedUser) {
  await getSettings();

  return save(
    {
      ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
      ...(input.secondaryColor !== undefined ? { secondaryColor: input.secondaryColor } : {}),
      // `null` remove o logotipo e volta ao símbolo padrão; ausente mantém o
      // que está lá. Sem essa distinção não haveria como apagar um logo já
      // enviado sem enviar outro por cima.
      ...(input.logo !== undefined ? { logo: input.logo } : {}),
    },
    actor,
  );
}

export async function updateGeneral(input: UpdateGeneralInput, actor: AuthenticatedUser) {
  await getSettings();
  return save(input, actor);
}
