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

export interface MessagingProfile {
  role: string;
  is_active: boolean;
}

export interface QueryResult<T> {
  data: T | null;
  error: { code?: string } | null;
}

export interface MessageNotificationDependencies {
  loadProfile(userId: string): Promise<QueryResult<MessagingProfile>>;
  loadMessage(messageId: string): Promise<QueryResult<PersistedMessage>>;
  upsertNotification(notification: MessageNotificationInsert): Promise<{ error: { code?: string } | null }>;
}

export interface MessageNotificationResult {
  status: number;
  body: Record<string, unknown>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messagingRoles = ['admin', 'acheteur', 'agriculteur', 'fournisseur'];

function result(status: number, code: string, message: string): MessageNotificationResult {
  return { status, body: { code, message } };
}

export async function createMessageNotification(
  userId: string,
  messageId: string,
  dependencies: MessageNotificationDependencies
): Promise<MessageNotificationResult> {
  let profileResult: QueryResult<MessagingProfile>;
  try {
    profileResult = await dependencies.loadProfile(userId);
  } catch {
    return result(
      503,
      'CALLER_PROFILE_LOOKUP_FAILED',
      'Impossible de vérifier votre autorisation de messagerie.'
    );
  }
  if (profileResult.error) {
    return result(
      503,
      'CALLER_PROFILE_LOOKUP_FAILED',
      'Impossible de vérifier votre autorisation de messagerie.'
    );
  }
  const profile = profileResult.data;
  if (!profile || profile.is_active !== true || !messagingRoles.includes(profile.role)) {
    return result(
      403,
      'MESSAGING_NOT_ALLOWED',
      'Votre compte n’est pas autorisé à envoyer des notifications de messagerie.'
    );
  }

  let messageResult: QueryResult<PersistedMessage>;
  try {
    messageResult = await dependencies.loadMessage(messageId);
  } catch {
    return result(503, 'MESSAGE_LOOKUP_FAILED', 'Impossible de vérifier le message à notifier.');
  }
  if (messageResult.error) {
    return result(503, 'MESSAGE_LOOKUP_FAILED', 'Impossible de vérifier le message à notifier.');
  }
  const message = messageResult.data;
  if (!message || !isAuthorizedMessageSender(userId, message)) {
    return result(
      403,
      'MESSAGE_NOT_OWNED',
      'Vous n’êtes pas autorisé à créer une notification pour ce message.'
    );
  }

  try {
    const { error } = await dependencies.upsertNotification(toMessageNotification(message));
    if (error) {
      return result(
        503,
        'NOTIFICATION_CREATE_FAILED',
        'Le message est enregistré, mais sa notification n’a pas pu être créée.'
      );
    }
  } catch {
    return result(
      503,
      'NOTIFICATION_CREATE_FAILED',
      'Le message est enregistré, mais sa notification n’a pas pu être créée.'
    );
  }

  return { status: 200, body: { ok: true } };
}

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
