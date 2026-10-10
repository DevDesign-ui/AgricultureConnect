import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  calculateOrderAmount,
  isPaymentMethod,
  isPayableOrderStatus,
  isUuid,
  matchesPersistedOrderTotal,
} from '../supabase/functions/_shared/payment-validation.ts';
import {
  getPaymentDisplayStatus,
  isProviderConfirmedPayment,
} from '../src/lib/payment-status.ts';
import {
  isAllowedPaydunyaApiBaseUrl,
  isPaydunyaCheckoutUrl,
  verifyPaydunyaNotificationHash,
} from '../supabase/functions/_shared/paydunya-validation.ts';

const projectRoot = new URL('../', import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, projectRoot), 'utf8');

test('validates order identifiers, supported payment methods, and payable states', () => {
  assert.equal(isUuid('7a3d101c-f065-4c73-b569-48c883dd21de'), true);
  assert.equal(isUuid('../orders'), false);
  assert.equal(isPaymentMethod('wave'), true);
  assert.equal(isPaymentMethod('unapproved_provider'), false);
  assert.equal(isPayableOrderStatus('en_attente'), true);
  assert.equal(isPayableOrderStatus('confirmee'), true);
  assert.equal(isPayableOrderStatus('annulee'), false);
  assert.equal(isPayableOrderStatus('livree'), false);
});

test('calculates exact XOF whole-unit totals without trusting client input', () => {
  assert.equal(calculateOrderAmount([
    { quantite: 2, prix_unitaire: 1250 },
    { quantite: '3', prix_unitaire: '500' },
  ]), 4000);
  assert.equal(matchesPersistedOrderTotal(4000, '4000'), true);
  assert.equal(matchesPersistedOrderTotal(4000, '4000.5'), false);
});

test('rejects empty, fractional, negative, zero, and unsafe order amounts', () => {
  assert.throws(() => calculateOrderAmount([]), /aucun article/);
  assert.throws(() => calculateOrderAmount([{ quantite: 0, prix_unitaire: 50 }]), /Quantité/);
  assert.throws(() => calculateOrderAmount([{ quantite: 1, prix_unitaire: -1 }]), /Prix/);
  assert.throws(() => calculateOrderAmount([{ quantite: 1, prix_unitaire: 1.25 }]), /Prix/);
  assert.throws(() => calculateOrderAmount([{ quantite: 1, prix_unitaire: 0 }]), /supérieur à zéro/);
  assert.throws(() => calculateOrderAmount([
    { quantite: Number.MAX_SAFE_INTEGER, prix_unitaire: 2 },
  ]), /précision/);
});

test('requires an authenticated provider confirmation flag as well as evidence fields', () => {
  const legacyPayment = {
    statut: 'valide',
    provider_event_id: null,
    provider_confirmed_at: null,
    provider_confirmation_verified: false,
  };
  assert.equal(isProviderConfirmedPayment(legacyPayment), false);
  assert.equal(getPaymentDisplayStatus(legacyPayment), 'non_verifie');

  const providerConfirmedPayment = {
    ...legacyPayment,
    provider_event_id: 'provider-event-1',
    provider_confirmed_at: '2026-10-09T12:00:00.000Z',
  };
  assert.equal(isProviderConfirmedPayment(providerConfirmedPayment), false);
  assert.equal(getPaymentDisplayStatus(providerConfirmedPayment), 'non_verifie');
  assert.equal(isProviderConfirmedPayment({
    ...providerConfirmedPayment,
    provider_confirmation_verified: true,
  }), true);
});

test('restricts PayDunya API and checkout URLs to the official HTTPS host', () => {
  assert.equal(isAllowedPaydunyaApiBaseUrl('https://app.paydunya.com/api/v1'), true);
  assert.equal(isAllowedPaydunyaApiBaseUrl('https://attacker.example/api/v1'), false);
  assert.equal(isPaydunyaCheckoutUrl('https://app.paydunya.com/checkout/invoice/abc123'), true);
  assert.equal(isPaydunyaCheckoutUrl('https://app.paydunya.com/sandbox-checkout/invoice/test_abc123'), true);
  assert.equal(isPaydunyaCheckoutUrl('https://attacker.example/checkout/invoice/abc123'), false);
  assert.equal(isPaydunyaCheckoutUrl('http://app.paydunya.com/checkout/invoice/abc123'), false);
});

test('authenticates PayDunya callback hash using the documented SHA-512 master-key hash', async () => {
  const masterKey = 'local-test-master-key';
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(masterKey));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(await verifyPaydunyaNotificationHash(masterKey, hash), true);
  assert.equal(await verifyPaydunyaNotificationHash(masterKey, `${hash.slice(0, -1)}0`), false);
  assert.equal(await verifyPaydunyaNotificationHash(masterKey, 'invalid'), false);
});

test('the payment UI cannot create or validate payment rows from the browser', async () => {
  const source = await readProjectFile('src/pages/Payments.tsx');
  assert.doesNotMatch(source, /\.from\(['"]payments['"]\)\s*\.insert/);
  assert.doesNotMatch(source, /statut:\s*['"]valide['"]/);
  assert.doesNotMatch(source, /Date\.now\(\)/);
  assert.match(source, /functions\.invoke\('payment-initiate'/);
  assert.match(source, /window\.location\.assign/);
  assert.doesNotMatch(source, /location\.state[^;]*amount/);
});

test('the server initiation endpoint authenticates, authorizes, recalculates, and creates only pending attempts', async () => {
  const source = await readProjectFile('supabase/functions/payment-initiate/index.ts');
  assert.match(source, /authClient\.auth\.getUser\(\)/);
  assert.match(source, /order\.acheteur_id !== user\.id/);
  assert.match(source, /calculateOrderAmount\(items\)/);
  assert.match(source, /matchesPersistedOrderTotal\(amount, order\.total\)/);
  assert.match(source, /PAYDUNYA-MASTER-KEY/);
  assert.match(source, /ORDER_ALREADY_PAID/);
  assert.match(source, /PAYMENT_HISTORY_REVIEW_REQUIRED/);
  assert.match(source, /provider_confirmation_verified', false/);
  assert.match(source, /PAYMENT_PROVIDER_OUTCOME_UNKNOWN/);
  assert.match(source, /admin\s*\.from\(['"]payments['"]\)\s*\.insert/);
  assert.match(source, /statut: 'initie'/);
  assert.doesNotMatch(source, /statut:\s*['"]valide['"]/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('the SQL migration preserves participant reads and blocks direct writes and fake confirmations', async () => {
  const sql = await readProjectFile('supabase/migrations/20261009190000_secure_payment_attempts.sql');
  assert.match(sql, /CREATE POLICY "payments_select"[\s\S]*auth\.uid\(\) = user_id[\s\S]*auth\.uid\(\) = o\.acheteur_id OR auth\.uid\(\) = o\.seller_id/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.payments FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT SELECT \([\s\S]*\) ON TABLE public\.payments TO authenticated/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON public\.payments/);
  assert.match(sql, /Payment confirmation is disabled until an authenticated provider integration is approved/);
  assert.match(sql, /NEW\.montant <> v_items_total/);
  assert.match(sql, /NEW\.user_id IS DISTINCT FROM v_order_buyer/);
  assert.match(sql, /unverified historical payment; manual reconciliation is required/);
  assert.match(sql, /p\.provider_event_id IS NOT NULL[\s\S]*p\.provider_confirmed_at IS NOT NULL/);
  assert.match(sql, /payments_reference_unique/);
  assert.match(sql, /payments_idempotency_key_unique/);
  assert.match(sql, /payments_provider_event_id_unique/);
  assert.match(sql, /DROP POLICY IF EXISTS "payments_select"/);
  assert.doesNotMatch(sql, /DROP POLICY %I ON public\.payments/);
  assert.match(sql, /CREATE POLICY "ac_payments_read_boundary"[\s\S]*AS RESTRICTIVE[\s\S]*auth\.uid\(\) = o\.acheteur_id OR auth\.uid\(\) = o\.seller_id[\s\S]*p\.role = 'admin'/);
  assert.match(sql, /CREATE POLICY "ac_payments_no_client_insert"[\s\S]*WITH CHECK \(false\)/);
  assert.match(sql, /CREATE POLICY "ac_payments_no_client_update"[\s\S]*USING \(false\)[\s\S]*WITH CHECK \(false\)/);
  assert.match(sql, /CREATE POLICY "ac_payments_no_client_delete"[\s\S]*USING \(false\)/);
  assert.match(sql, /REVOKE ALL PRIVILEGES \(%s\) ON TABLE public\.payments FROM PUBLIC, anon, authenticated/);
  assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/);

  const correctiveMigration = await readProjectFile('supabase/migrations/20261009191000_payment_provider_and_history_hardening.sql');
  assert.match(correctiveMigration, /c\.table_schema = COALESCE\([\s\S]*'public'[\s\S]*\)[\s\S]*c\.table_name = CASE[\s\S]*required\.table_name/);
  assert.match(correctiveMigration, /ON DELETE RESTRICT/);
  assert.match(correctiveMigration, /payments_one_open_attempt_per_order/);
  assert.match(correctiveMigration, /provider_confirmation_verified boolean NOT NULL DEFAULT false/);
  assert.match(correctiveMigration, /policyname IN \([\s\S]*'payments_select', 'payments_insert', 'payments_update', 'payments_delete'[\s\S]*\)[\s\S]*DROP POLICY %I/);
  assert.doesNotMatch(correctiveMigration, /WHERE schemaname = 'public' AND tablename = 'payments'\s+LOOP/);
  assert.match(correctiveMigration, /CREATE POLICY "ac_payments_read_boundary"[\s\S]*AS RESTRICTIVE[\s\S]*p\.role = 'admin'/);
  assert.match(correctiveMigration, /CREATE POLICY "ac_payments_no_client_insert"[\s\S]*WITH CHECK \(false\)/);
  assert.match(correctiveMigration, /CREATE POLICY "ac_payments_no_client_update"[\s\S]*USING \(false\)[\s\S]*WITH CHECK \(false\)/);
  assert.match(correctiveMigration, /CREATE POLICY "ac_payments_no_client_delete"[\s\S]*USING \(false\)/);
  assert.match(correctiveMigration, /GRANT SELECT \([\s\S]*provider_confirmation_verified/);
  assert.match(correctiveMigration, /NEW\.statut = 'valide'[\s\S]*provider_confirmation_verified IS DISTINCT FROM true/);
  assert.match(correctiveMigration, /p\.statut = 'valide'[\s\S]*provider_confirmation_verified IS DISTINCT FROM true[\s\S]*unverified historical payment/);
  assert.match(correctiveMigration, /orders_guard_payment_status/);
  assert.match(correctiveMigration, /apply_paydunya_confirmation/);
  assert.match(correctiveMigration, /DROP FUNCTION IF EXISTS public\.apply_paydunya_confirmation\(text, text, text, numeric\)/);
  assert.match(correctiveMigration, /p_order_id uuid/);
  assert.match(correctiveMigration, /p\.commande_id = p_order_id/);
  assert.match(correctiveMigration, /payment_status = 'paye'/);
  assert.match(correctiveMigration, /GRANT EXECUTE ON FUNCTION public\.apply_paydunya_confirmation[\s\S]*TO service_role/);
  assert.match(correctiveMigration, /v_payment\.methode IS DISTINCT FROM 'paydunya_checkout'/);
  assert.match(correctiveMigration, /v_items_total <> p_amount/);
  assert.match(correctiveMigration, /Record receipt without changing orders\.statut/);
  assert.doesNotMatch(correctiveMigration, /Late successful payment for a cancelled order requires manual reconciliation/);
  assert.doesNotMatch(correctiveMigration, /DELETE FROM public\.payments/i);
  assert.doesNotMatch(correctiveMigration, /DISABLE ROW LEVEL SECURITY/);
});

test('the provider callback authenticates, re-confirms server-side, and applies status atomically', async () => {
  const source = await readProjectFile('supabase/functions/payment-notify/index.ts');
  assert.match(source, /verifyPaydunyaNotificationHash/);
  assert.match(source, /!isUuid\(orderId\)/);
  assert.match(source, /checkout-invoice\/confirm/);
  assert.match(source, /PROVIDER_CONFIRMATION_NOT_VERIFIED/);
  assert.match(source, /\.rpc\('apply_paydunya_confirmation'/);
  assert.match(source, /p_order_id: orderId/);
  assert.doesNotMatch(source, /\.from\(['"]payments['"]\)\s*\.update/);
  assert.doesNotMatch(source, /request\.headers\.get\('Authorization'\)/);
});
