import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  createMessageNotification,
  parseMessageId,
} from '../_shared/message-notify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

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
  const outcome = await createMessageNotification(user.id, messageId, {
    loadProfile: async (userId) => await admin
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', userId)
      .maybeSingle(),
    loadMessage: async (id) => await admin
      .from('messages')
      .select('id, expediteur_id, destinataire_id')
      .eq('id', id)
      .maybeSingle(),
    upsertNotification: async (notification) => await admin
      .from('notifications')
      .upsert(notification, {
        onConflict: 'source_message_id',
        ignoreDuplicates: true,
      }),
  });
  if (outcome.status >= 500) {
    console.error('Message notification request failed', outcome.body.code);
  }
  return jsonResponse(outcome.status, outcome.body);
}

if (import.meta.main) Deno.serve(handler);
