import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  calculateOrderAmount,
  isPayableOrderStatus,
  isUuid,
  matchesPersistedOrderTotal,
} from '../_shared/payment-validation.ts';
import {
  isAllowedPaydunyaApiBaseUrl,
  isPaydunyaCheckoutUrl,
} from '../_shared/paydunya-validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function requiredHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { code: 'INVALID_JSON', message: 'Corps JSON invalide.' });
  }
  if (typeof body !== 'object' || body === null || !('orderId' in body) || !('idempotencyKey' in body)) {
    return jsonResponse(400, { code: 'INVALID_REQUEST', message: 'Commande et clé d’idempotence requises.' });
  }
  const { orderId, idempotencyKey } = body as { orderId: unknown; idempotencyKey: unknown };
  if (!isUuid(orderId) || !isUuid(idempotencyKey)) {
    return jsonResponse(400, { code: 'INVALID_REQUEST', message: 'Identifiant de commande ou clé d’idempotence invalide.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const masterKey = Deno.env.get('PAYDUNYA_MASTER_KEY');
  const privateKey = Deno.env.get('PAYDUNYA_PRIVATE_KEY');
  const paydunyaToken = Deno.env.get('PAYDUNYA_TOKEN');
  const apiBaseUrl = Deno.env.get('PAYDUNYA_API_BASE_URL');
  const callbackUrl = requiredHttpsUrl(Deno.env.get('PAYDUNYA_CALLBACK_URL'));
  const returnUrl = requiredHttpsUrl(Deno.env.get('PAYDUNYA_RETURN_URL'));

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(503, { code: 'FUNCTION_MISCONFIGURED', message: 'Configuration Supabase serveur incomplète.' });
  }
  if (!masterKey || !privateKey || !paydunyaToken || !apiBaseUrl
      || !isAllowedPaydunyaApiBaseUrl(apiBaseUrl) || !callbackUrl || !returnUrl) {
    return jsonResponse(503, {
      code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      message: 'PayDunya n’est pas configuré pour ce projet. Aucun paiement n’a été créé.',
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
  const { data: order, error: orderError } = await admin
    .from('orders')
    .select('id, acheteur_id, statut, total, payment_status')
    .eq('id', orderId)
    .maybeSingle();
  if (orderError) {
    return jsonResponse(503, { code: 'ORDER_LOOKUP_FAILED', message: 'Impossible de vérifier la commande.' });
  }
  if (!order || order.acheteur_id !== user.id) {
    return jsonResponse(404, { code: 'ORDER_NOT_FOUND', message: 'Commande introuvable ou non autorisée.' });
  }
  if (!isPayableOrderStatus(order.statut)) {
    return jsonResponse(409, { code: 'ORDER_NOT_PAYABLE', message: 'Cette commande ne peut pas être payée dans son état actuel.' });
  }
  if (order.payment_status === 'paye') {
    return jsonResponse(409, { code: 'ORDER_ALREADY_PAID', message: 'Cette commande possède déjà un paiement vérifié.' });
  }

  const { data: items, error: itemsError } = await admin
    .from('order_items')
    .select('quantite, prix_unitaire')
    .eq('commande_id', order.id);
  if (itemsError || !items) {
    return jsonResponse(503, { code: 'ORDER_ITEMS_LOOKUP_FAILED', message: 'Impossible de vérifier les articles.' });
  }

  let amount: number;
  try {
    amount = calculateOrderAmount(items);
  } catch {
    return jsonResponse(409, { code: 'INVALID_ORDER_AMOUNT', message: 'Le montant enregistré est invalide.' });
  }
  if (!matchesPersistedOrderTotal(amount, order.total)) {
    return jsonResponse(409, { code: 'ORDER_TOTAL_MISMATCH', message: 'Le total ne correspond pas aux articles de la commande.' });
  }

  const { data: confirmedPayment, error: confirmedPaymentError } = await admin
    .from('payments')
    .select('id')
    .eq('commande_id', order.id)
    .eq('statut', 'valide')
    .eq('provider_confirmation_verified', true)
    .maybeSingle();
  if (confirmedPaymentError) {
    return jsonResponse(503, { code: 'PAYMENT_LOOKUP_FAILED', message: 'Impossible de vérifier les paiements confirmés.' });
  }
  if (confirmedPayment) {
    return jsonResponse(409, { code: 'ORDER_ALREADY_PAID', message: 'Cette commande possède déjà un paiement fournisseur vérifié.' });
  }

  const { data: legacyPayment, error: legacyPaymentError } = await admin
    .from('payments')
    .select('id')
    .eq('commande_id', order.id)
    .eq('statut', 'valide')
    .eq('provider_confirmation_verified', false)
    .limit(1)
    .maybeSingle();
  if (legacyPaymentError) {
    return jsonResponse(503, { code: 'PAYMENT_LOOKUP_FAILED', message: 'Impossible de vérifier l’historique des paiements.' });
  }
  if (legacyPayment) {
    return jsonResponse(409, {
      code: 'PAYMENT_HISTORY_REVIEW_REQUIRED',
      message: 'Un ancien paiement non vérifié existe pour cette commande. Un rapprochement manuel est nécessaire avant toute nouvelle tentative.',
    });
  }

  const { data: sameRequest, error: idempotencyLookupError } = await admin
    .from('payments')
    .select('id, commande_id, user_id, statut, provider_checkout_url')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (idempotencyLookupError) {
    return jsonResponse(503, { code: 'PAYMENT_LOOKUP_FAILED', message: 'Impossible de vérifier la tentative existante.' });
  }
  if (sameRequest) {
    if (sameRequest.commande_id !== order.id || sameRequest.user_id !== user.id) {
      return jsonResponse(409, { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Cette clé est déjà associée à une autre commande.' });
    }
    if (!['initie', 'en_attente'].includes(sameRequest.statut)) {
      return jsonResponse(409, { code: 'PAYMENT_ATTEMPT_FINAL', message: 'Cette tentative est déjà terminée.' });
    }
    if (sameRequest.provider_checkout_url) {
      return jsonResponse(200, { checkoutUrl: sameRequest.provider_checkout_url, reused: true });
    }
    return jsonResponse(409, {
      code: 'PAYMENT_ATTEMPT_IN_PROGRESS',
      message: 'La création de la session est en cours ou son résultat doit être vérifié. Ne relancez pas une nouvelle tentative.',
    });
  }

  const { data: openAttempt, error: openAttemptError } = await admin
    .from('payments')
    .select('id')
    .eq('commande_id', order.id)
    .in('statut', ['initie', 'en_attente'])
    .maybeSingle();
  if (openAttemptError) {
    return jsonResponse(503, { code: 'PAYMENT_LOOKUP_FAILED', message: 'Impossible de vérifier les tentatives existantes.' });
  }
  if (openAttempt) {
    return jsonResponse(409, { code: 'PAYMENT_ATTEMPT_ALREADY_OPEN', message: 'Une tentative de paiement existe déjà pour cette commande.' });
  }

  const reference = crypto.randomUUID();
  const { data: payment, error: insertError } = await admin
    .from('payments')
    .insert({
      commande_id: order.id,
      user_id: user.id,
      montant: amount,
      currency: 'XOF',
      methode: 'paydunya_checkout',
      statut: 'initie',
      reference,
      idempotency_key: idempotencyKey,
    })
    .select('id, reference')
    .single();
  if (insertError || !payment) {
    if (insertError?.code === '23505') {
      return jsonResponse(409, { code: 'PAYMENT_ATTEMPT_ALREADY_OPEN', message: 'Une tentative concurrente est déjà enregistrée.' });
    }
    return jsonResponse(503, { code: 'PAYMENT_ATTEMPT_CREATE_FAILED', message: 'Impossible de créer la tentative de paiement.' });
  }

  const invoiceItems = Object.fromEntries(items.map((item, index) => [
    `item_${index}`,
    {
      name: `Article ${index + 1}`,
      quantity: Number(item.quantite),
      unit_price: String(item.prix_unitaire),
      total_price: String(Number(item.quantite) * Number(item.prix_unitaire)),
    },
  ]));
  let providerResponse: Response;
  try {
    providerResponse = await fetch(`${apiBaseUrl}/checkout-invoice/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': masterKey,
        'PAYDUNYA-PRIVATE-KEY': privateKey,
        'PAYDUNYA-TOKEN': paydunyaToken,
      },
      body: JSON.stringify({
        invoice: {
          items: invoiceItems,
          total_amount: amount,
          description: `Commande AgricultureConnect ${order.id}`,
        },
        store: { name: 'AgricultureConnect' },
        custom_data: { payment_reference: reference, order_id: order.id },
        actions: { callback_url: callbackUrl, return_url: returnUrl, cancel_url: returnUrl },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return jsonResponse(503, {
      code: 'PAYMENT_PROVIDER_OUTCOME_UNKNOWN',
      message: 'Le résultat de la demande auprès de PayDunya est incertain. La tentative reste bloquée pour éviter une double facturation; vérifiez-la côté marchand.',
    });
  }

  let providerData: Record<string, unknown>;
  try {
    providerData = await providerResponse.json() as Record<string, unknown>;
  } catch {
    return jsonResponse(503, {
      code: 'PAYMENT_PROVIDER_INVALID_RESPONSE',
      message: 'PayDunya a renvoyé une réponse inexploitable. La tentative doit être vérifiée côté marchand.',
    });
  }
  const checkoutUrl = providerData.response_text;
  const providerReference = providerData.token;
  if (!providerResponse.ok || providerData.response_code !== '00'
      || !isPaydunyaCheckoutUrl(checkoutUrl)
      || typeof providerReference !== 'string' || providerReference.length === 0) {
    await admin.from('payments').update({ statut: 'echoue' }).eq('id', payment.id).eq('statut', 'initie');
    return jsonResponse(502, { code: 'PAYMENT_PROVIDER_REJECTED', message: 'PayDunya n’a pas accepté la création de la session.' });
  }

  const { error: saveSessionError } = await admin
    .from('payments')
    .update({
      statut: 'en_attente',
      provider_reference: providerReference,
      provider_checkout_url: checkoutUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id)
    .eq('statut', 'initie');
  if (saveSessionError) {
    return jsonResponse(503, {
      code: 'PAYMENT_SESSION_SAVE_FAILED',
      message: 'La session a été créée mais son enregistrement local a échoué. Ne créez pas une seconde tentative; vérifiez la transaction côté marchand.',
    });
  }

  return jsonResponse(200, { checkoutUrl, reused: false });
});
