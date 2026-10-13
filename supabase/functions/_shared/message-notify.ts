export interface PersistedMessage {
  id: string;
  expediteur_id: string;
  destinataire_id: string;
}

export interface MessageNotificationInsert {
  source_message_id: string;
  user_id: string;
  type: 'message';
  titre: string;
  contenu: string;
  lien: string;
  lue: false;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMessageId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).length !== 1 || typeof body.messageId !== 'string') return null;
  return uuidPattern.test(body.messageId) ? body.messageId : null;
}

export function isAuthorizedMessageSender(userId: string, message: PersistedMessage): boolean {
  return userId === message.expediteur_id && message.expediteur_id !== message.destinataire_id;
}

export function toMessageNotification(message: PersistedMessage): MessageNotificationInsert {
  return {
    source_message_id: message.id,
    user_id: message.destinataire_id,
    type: 'message',
    titre: 'Nouveau message',
    contenu: 'Vous avez reçu un message',
    lien: '/messages',
    lue: false,
  };
}
