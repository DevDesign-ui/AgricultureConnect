import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isUuid } from '../_shared/payment-validation.ts';
import { verifyPaydunyaNotificationHash } from '../_shared/paydunya-validation.ts';

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readNotification(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get('Content-Type') ?? '';
  try {
    let payload: unknown;
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = new URLSearchParams(await request.text());
      const rawData = form.get('data');
      if (!rawData) return null;
      payload = JSON.parse(rawData);
    } else {
      payload = await request.json();
    }
    if (typeof payload !== 'object' || payload === null) return null;
    const root = payload as Record<string, unknown>;
    const data = root.data;
    return typeof data === 'object' && data !== null
      ? { ...root, ...(data as Record<string, unknown>) }
      : root;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { code: 'METHOD_NOT_ALLOWED' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const masterKey = Deno.env.get('PAYDUNYA_MASTER_KEY');
  const privateKey = Deno.env.get('PAYDUNYA_PRIVATE_KEY');
  const paydunyaToken = Deno.env.get('PAYDUNYA_TOKEN');
  const apiBaseUrl = Deno.env.get('PAYDUNYA_API_BASE_URL');
  if (!supabaseUrl || !serviceRoleKey || !masterKey || !privateKey || !paydunyaToken || !apiBaseUrl) {
    return jsonResponse(503, { code: 'FUNCTION_MISCONFIGURED' });
  }

  const notification = await readNotification(request);
  if (!notification || !await verifyPaydunyaNotificationHash(masterKey, notification.hash)) {
    return jsonResponse(401, { code: 'INVALID_PROVIDER_AUTHENTICATION' });
  }

  const invoice = notification.invoice;
  if (typeof invoice !== 'object' || invoice === null) {
    return jsonResponse(400, { code: 'INVALID_NOTIFICATION' });
  }
  const invoiceData = invoice as Record<string, unknown>;
  const providerReference = invoiceData.token;
  if (typeof providerReference !== 'string' || providerReference.length === 0
      || providerReference.length > 200) {
    return jsonResponse(400, { code: 'INVALID_NOTIFICATION' });
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch(
      `${apiBaseUrl}/checkout-invoice/confirm/${encodeURIComponent(providerReference)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'PAYDUNYA-MASTER-KEY': masterKey,
          'PAYDUNYA-PRIVATE-KEY': privateKey,
          'PAYDUNYA-TOKEN': paydunyaToken,
        },
        signal: AbortSignal.timeout(15_000),
      }
    );
  } catch {
    return jsonResponse(503, { code: 'PROVIDER_CONFIRMATION_UNAVAILABLE' });
  }

  let confirmedData: Record<string, unknown>;
  try {
    confirmedData = await providerResponse.json() as Record<string, unknown>;
  } catch {
    return jsonResponse(503, { code: 'INVALID_PROVIDER_CONFIRMATION_RESPONSE' });
  }
  const confirmedInvoice = confirmedData.invoice;
  if (!providerResponse.ok || confirmedData.response_code !== '00'
      || !await verifyPaydunyaNotificationHash(masterKey, confirmedData.hash)
      || typeof confirmedInvoice !== 'object' || confirmedInvoice === null) {
    return jsonResponse(401, { code: 'PROVIDER_CONFIRMATION_NOT_VERIFIED' });
  }
  const verifiedInvoice = confirmedInvoice as Record<string, unknown>;
  if (verifiedInvoice.token !== providerReference) {
    return jsonResponse(409, { code: 'PROVIDER_REFERENCE_MISMATCH' });
  }
  const amount = Number(verifiedInvoice.total_amount);
  const providerStatus = typeof confirmedData.status === 'string'
    ? confirmedData.status.toLowerCase()
    : '';
  const confirmedCustomData = confirmedData.custom_data;
  const customData = typeof confirmedCustomData === 'object' && confirmedCustomData !== null
    ? confirmedCustomData as Record<string, unknown>
    : null;
  const paymentReference = customData?.payment_reference;
  const orderId = customData?.order_id;
  if (typeof paymentReference !== 'string' || paymentReference.length === 0
      || !isUuid(orderId)) {
    return jsonResponse(400, { code: 'INVALID_PROVIDER_CUSTOM_DATA' });
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return jsonResponse(400, { code: 'INVALID_PROVIDER_AMOUNT' });
  }

  if (!['completed', 'pending', 'failed', 'cancelled', 'expired'].includes(providerStatus)) {
    return jsonResponse(400, { code: 'UNSUPPORTED_PROVIDER_STATUS' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let result: string | null = null;
  let applyError: { code: string; message: string } | null = null;
  try {
    const rpcResult = await supabase.rpc('apply_paydunya_confirmation', {
      p_payment_reference: paymentReference,
      p_provider_reference: providerReference,
      p_order_id: orderId,
      p_provider_status: providerStatus,
      p_amount: amount,
    });
    result = rpcResult.data;
    applyError = rpcResult.error;
  } catch {
    console.error('PayDunya confirmation database request failed');
    return jsonResponse(503, { code: 'PAYMENT_UPDATE_UNAVAILABLE' });
  }
  if (applyError) {
    console.error('Unable to apply confirmed PayDunya status', applyError.code);
    if (applyError.message.includes('not found')) {
      return jsonResponse(404, { code: 'PAYMENT_NOT_FOUND' });
    }
    const transientDatabaseError = applyError.code.startsWith('PGRST')
      || applyError.code.startsWith('08')
      || applyError.code.startsWith('53')
      || applyError.code.startsWith('57');
    return transientDatabaseError
      ? jsonResponse(503, { code: 'PAYMENT_UPDATE_UNAVAILABLE' })
      : jsonResponse(409, { code: 'PAYMENT_STATE_CHANGED' });
  }

  return jsonResponse(200, { received: true, duplicate: result === 'duplicate' });
});
