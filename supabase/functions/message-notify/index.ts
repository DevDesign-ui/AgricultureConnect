import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  isAuthorizedMessageSender,
  parseMessageId,
  toMessageNotification,
  type PersistedMessage,
} from '../_shared/message-notify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const messagingRoles = ['admin', 'acheteur', 'agriculteur', 'fournisseur'];

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') {
    return jsonResponse(405, { code: 'METHOD_NOT_ALLOWED', message: 'Méthode non autorisée.' });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(401, { code: 'AUTH_REQUIRED', message: 'Authentification requise.' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { code: 'INVALID_BODY', message: 'Le corps de la requête est invalide.' });
  }
  const messageId = parseMessageId(body);
  if (!messageId) {
    return jsonResponse(400, {
      code: 'INVALID_MESSAGE_ID',
      message: 'Un identifiant de message valide est requis.',
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(503, {
      code: 'FUNCTION_MISCONFIGURED',
      message: 'Le service de notification n’est pas configuré côté serveur.',
    });
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse(401, { code: 'AUTH_INVALID', message: 'Session utilisateur invalide.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Unable to verify message notification caller', profileError.code);
    return jsonResponse(503, {
      code: 'CALLER_PROFILE_LOOKUP_FAILED',
      message: 'Impossible de vérifier votre autorisation de messagerie.',
    });
  }
  if (!profile || profile.is_active !== true || !messagingRoles.includes(profile.role)) {
    return jsonResponse(403, {
      code: 'MESSAGING_NOT_ALLOWED',
      message: 'Votre compte n’est pas autorisé à envoyer des notifications de messagerie.',
    });
  }

  const { data: message, error: messageError } = await admin
    .from('messages')
    .select('id, expediteur_id, destinataire_id')
    .eq('id', messageId)
    .maybeSingle();
  if (messageError) {
    console.error('Unable to load message for notification', messageError.code);
    return jsonResponse(503, {
      code: 'MESSAGE_LOOKUP_FAILED',
      message: 'Impossible de vérifier le message à notifier.',
    });
  }
  if (!message || !isAuthorizedMessageSender(user.id, message as PersistedMessage)) {
    return jsonResponse(403, {
      code: 'MESSAGE_NOT_OWNED',
      message: 'Vous n’êtes pas autorisé à créer une notification pour ce message.',
    });
  }

  const { error: notificationError } = await admin
    .from('notifications')
    .upsert(toMessageNotification(message as PersistedMessage), {
      onConflict: 'source_message_id',
      ignoreDuplicates: true,
    });
  if (notificationError) {
    console.error('Unable to create message notification', notificationError.code);
    return jsonResponse(503, {
      code: 'NOTIFICATION_CREATE_FAILED',
      message: 'Le message est enregistré, mais sa notification n’a pas pu être créée.',
    });
  }

  return jsonResponse(200, { ok: true });
}

if (import.meta.main) Deno.serve(handler);
