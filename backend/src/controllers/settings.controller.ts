import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  getSettings,
  updateAppearance,
  updateCompany,
  updateGeneral,
} from '../services/settings.service.js';
import { recordAudit } from '../services/audit.service.js';
import { ok } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';
import { validate } from '../utils/validate.js';
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_TIME_ZONES,
  updateAppearanceSchema,
  updateCompanySchema,
  updateGeneralSchema,
} from '../validators/settings.validator.js';

function requireUser(request: FastifyRequest) {
  const user = request.currentUser;
  if (!user) throw AppError.unauthorized();
  return user;
}

/**
 * GET /api/settings
 *
 * Aberta a qualquer usuário autenticado, e isso é deliberado: a interface
 * inteira depende dela para desenhar o logotipo, as cores e o formato de data.
 * Restringir a leitura ao administrador faria o sistema aparecer sem a marca
 * para o funcionário.
 *
 * Nada aqui é sigiloso — são o nome da empresa, o endereço que já está no
 * rodapé de qualquer documento emitido e as preferências de exibição. Quem
 * ALTERA continua sendo só o administrador.
 */
export async function getSettingsController(_request: FastifyRequest, reply: FastifyReply) {
  const settings = await getSettings();

  return reply.status(200).send(
    ok({
      settings,
      // As listas viajam junto para a interface montar os seletores sem manter
      // uma segunda cópia delas. Divergir seria oferecer na tela um fuso que a
      // API recusa.
      options: {
        currencies: SUPPORTED_CURRENCIES,
        timeZones: SUPPORTED_TIME_ZONES,
        dateFormats: SUPPORTED_DATE_FORMATS,
      },
    }),
  );
}

/** PUT /api/settings/company */
export async function updateCompanyController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const input = validate(updateCompanySchema, request.body);

  const settings = await updateCompany(input, actor);

  await recordAudit(actor, {
    action: 'SETTINGS_UPDATED',
    entity: 'SETTINGS',
    entityId: settings.id,
    entityLabel: 'Dados da empresa',
    metadata: { camposEnviados: Object.keys(input) },
  });

  return reply.status(200).send(ok(settings));
}

/** PUT /api/settings/appearance */
export async function updateAppearanceController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const input = validate(updateAppearanceSchema, request.body);

  const settings = await updateAppearance(input, actor);

  // O logotipo é omitido do metadata pelo sanitizador: é um data URL de
  // centenas de kilobytes, e "o logotipo mudou" já é toda a informação útil.
  await recordAudit(actor, {
    action: 'SETTINGS_UPDATED',
    entity: 'SETTINGS',
    entityId: settings.id,
    entityLabel: 'Identidade visual',
    metadata: { camposEnviados: Object.keys(input) },
  });

  return reply.status(200).send(ok(settings));
}

/** PUT /api/settings/general */
export async function updateGeneralController(request: FastifyRequest, reply: FastifyReply) {
  const actor = requireUser(request);
  const input = validate(updateGeneralSchema, request.body);

  const settings = await updateGeneral(input, actor);

  await recordAudit(actor, {
    action: 'SETTINGS_UPDATED',
    entity: 'SETTINGS',
    entityId: settings.id,
    entityLabel: 'Preferências gerais',
    metadata: {
      antecedenciaDias: settings.dueSoonDays,
      fuso: settings.timeZone,
      moeda: settings.currency,
      formatoData: settings.dateFormat,
    },
  });

  return reply.status(200).send(ok(settings));
}
