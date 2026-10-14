import type { NotificationSeverity, NotificationType } from '@prisma/client';

/**
 * Canais de entrega de notificação.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTE ARQUIVO PREPARA
 * ---------------------------------------------------------------------------
 * Hoje só existe o canal `IN_APP`, que não "entrega" nada — a notificação
 * aparece no sino pelo simples fato de existir a linha no banco. O arquivo
 * existe para que acrescentar e-mail, WhatsApp ou push seja escrever uma
 * implementação desta interface e registrá-la na lista, sem tocar em quem
 * decide QUAIS notificações existem.
 *
 * A separação que importa é essa: o GERADOR (notification.service.ts) responde
 * "o que precisa de atenção"; o DESPACHANTE responde "por onde isso sai". Sem
 * essa fronteira, adicionar e-mail significaria mexer na varredura que calcula
 * faturas atrasadas — e um bug no cliente SMTP passaria a poder derrubar o
 * cálculo dos alertas.
 *
 * `deliveredChannels` na linha da notificação é o que impede reenvio: a
 * varredura roda de novo a cada consulta ao sino, e sem esse registro o cliente
 * receberia o mesmo e-mail a cada minuto.
 */

export interface NotificationPayload {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  link: string | null;
}

export interface NotificationRecipient {
  id: string;
  name: string;
  email: string;
}

export interface NotificationChannel {
  /** Identificador gravado em `deliveredChannels`. */
  readonly id: string;

  /**
   * Desligado por configuração ou por falta de credencial.
   *
   * Consultado a cada despacho, não apenas na inicialização: um canal pode
   * depender de variável de ambiente que só aparece em produção.
   */
  isEnabled(): boolean;

  /**
   * Entrega a notificação. Deve ser idempotente do ponto de vista do canal —
   * o despachante já evita rechamar, mas uma falha parcial de rede pode
   * duplicar a tentativa.
   */
  deliver(payload: NotificationPayload, recipient: NotificationRecipient): Promise<void>;
}

/**
 * Canal padrão: a própria interface.
 *
 * `deliver` é um no-op de propósito. A notificação já está gravada quando o
 * despachante roda, e é a existência da linha que a faz aparecer no sino. O
 * canal existe na lista para que `deliveredChannels` registre `IN_APP` como
 * qualquer outro — assim a coluna descreve a entrega completa, e não apenas os
 * canais externos.
 */
export const inAppChannel: NotificationChannel = {
  id: 'IN_APP',
  isEnabled: () => true,
  deliver: async () => {
    // Nada a fazer: a linha no banco É a entrega.
  },
};

/**
 * Canais registrados, em ordem de despacho.
 *
 * Para acrescentar e-mail: criar `emailChannel` com `isEnabled()` conferindo a
 * configuração SMTP e `deliver()` enviando a mensagem, e incluí-lo aqui. Nada
 * mais no sistema precisa mudar.
 */
export const NOTIFICATION_CHANNELS: NotificationChannel[] = [inAppChannel];
