import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const contactRoles = ['acheteur', 'agriculteur', 'fournisseur'] as const;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') {
    return jsonResponse(405, { code: 'METHOD_NOT_ALLOWED', message: 'Méthode non autorisée.' });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(401, { code: 'AUTH_REQUIRED', message: 'Authentification requise.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(503, {
      code: 'FUNCTION_MISCONFIGURED',
      message: 'La fonction de contacts n’est pas configurée côté serveur.',
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
  const { data: callerProfile, error: callerError } = await admin
    .from('profiles')
    .select('role, is_active')
    .eq('user_id', user.id)
    .maybeSingle();
  if (callerError) {
    console.error('Unable to verify messaging caller profile', callerError.code);
    return jsonResponse(503, {
      code: 'CALLER_PROFILE_LOOKUP_FAILED',
      message: 'Impossible de vérifier votre autorisation de messagerie.',
    });
  }
  if (!callerProfile || callerProfile.is_active !== true
      || (callerProfile.role !== 'admin' && !contactRoles.includes(callerProfile.role))) {
    return jsonResponse(403, {
      code: 'MESSAGING_NOT_ALLOWED',
      message: 'Votre compte n’est pas autorisé à accéder à la messagerie.',
    });
  }

  const { data: contacts, error: contactsError } = await admin
    .from('profiles')
    .select('user_id, nom, prenom, role')
    .eq('is_active', true)
    .in('role', [...contactRoles])
    .neq('user_id', user.id)
    .order('nom', { ascending: true })
    .order('prenom', { ascending: true });
  if (contactsError) {
    console.error('Unable to load messaging contacts', contactsError.code);
    return jsonResponse(503, {
      code: 'CONTACTS_LOOKUP_FAILED',
      message: 'Impossible de charger les contacts. Réessayez plus tard.',
    });
  }

  return jsonResponse(200, { contacts: contacts ?? [] });
});
