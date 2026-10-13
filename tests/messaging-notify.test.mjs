import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createMessageNotification,
  isAuthorizedMessageSender,
  parseMessageId,
  toMessageNotification,
} from '../supabase/functions/_shared/message-notify.ts';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { getSupabaseFunctionErrorMessage } from '../src/lib/supabase-function-errors.ts';

const message = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  expediteur_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  destinataire_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};

function createDependencies(overrides = {}) {
  return {
    loadProfile: async () => ({
      data: { role: 'acheteur', is_active: true },
      error: null,
    }),
    loadMessage: async () => ({ data: message, error: null }),
    upsertNotification: async () => ({ error: null }),
    ...overrides,
  };
}

test('accepts only a single valid message ID in the request', () => {
  assert.equal(parseMessageId({ messageId: message.id }), message.id);
  assert.equal(parseMessageId({ messageId: 'not-a-uuid' }), null);
  assert.equal(parseMessageId({ messageId: message.id, userId: 'forged' }), null);
  assert.equal(parseMessageId(null), null);
});

test('authorizes only the persisted message sender', () => {
  assert.equal(isAuthorizedMessageSender(message.expediteur_id, message), true);
  assert.equal(isAuthorizedMessageSender(message.destinataire_id, message), false);
  assert.equal(isAuthorizedMessageSender('dddddddd-dddd-4ddd-8ddd-dddddddddddd', message), false);
  assert.equal(isAuthorizedMessageSender(message.expediteur_id, {
    ...message,
    destinataire_id: message.expediteur_id,
  }), false);
});

test('derives notification recipient and content from server-owned message data', () => {
  assert.deepEqual(toMessageNotification(message), {
    source_message_id: message.id,
    user_id: message.destinataire_id,
    type: 'message',
    titre: 'Nouveau message',
    contenu: 'Vous avez reçu un message',
    lien: '/messages',
    lue: false,
  });
});

test('simulated flow creates a notification for the persisted message recipient', async () => {
  let insertedNotification;
  const result = await createMessageNotification(
    message.expediteur_id,
    message.id,
    createDependencies({
      upsertNotification: async (notification) => {
        insertedNotification = notification;
        return { error: null };
      },
    })
  );

  assert.deepEqual(result, { status: 200, body: { ok: true } });
  assert.equal(insertedNotification.user_id, message.destinataire_id);
  assert.equal(insertedNotification.source_message_id, message.id);
});

test('simulated flow rejects a message that does not exist', async () => {
  const result = await createMessageNotification(
    message.expediteur_id,
    message.id,
    createDependencies({ loadMessage: async () => ({ data: null, error: null }) })
  );

  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'MESSAGE_NOT_OWNED');
});

test('simulated flow rejects a caller who is not the persisted sender', async () => {
  let upsertCalled = false;
  const result = await createMessageNotification(
    message.destinataire_id,
    message.id,
    createDependencies({
      upsertNotification: async () => {
        upsertCalled = true;
        return { error: null };
      },
    })
  );

  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'MESSAGE_NOT_OWNED');
  assert.equal(upsertCalled, false);
});

test('simulated flow reports profile and message read failures', async (t) => {
  await t.test('profile lookup error', async () => {
    const result = await createMessageNotification(
      message.expediteur_id,
      message.id,
      createDependencies({ loadProfile: async () => ({ data: null, error: { code: 'DB_ERROR' } }) })
    );
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'CALLER_PROFILE_LOOKUP_FAILED');
  });

  await t.test('message lookup error', async () => {
    const result = await createMessageNotification(
      message.expediteur_id,
      message.id,
      createDependencies({ loadMessage: async () => ({ data: null, error: { code: 'DB_ERROR' } }) })
    );
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'MESSAGE_LOOKUP_FAILED');
  });
});

test('simulated flow reports a notification write failure', async () => {
  const result = await createMessageNotification(
    message.expediteur_id,
    message.id,
    createDependencies({
      upsertNotification: async () => ({ error: { code: 'DB_ERROR' } }),
    })
  );

  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'NOTIFICATION_CREATE_FAILED');
});

test('simulated upsert honoring the unique message key creates no duplicate on retry', async () => {
  const notificationsByMessageId = new Map();
  let upsertCalls = 0;
  const dependencies = createDependencies({
    upsertNotification: async (notification) => {
      upsertCalls += 1;
      if (!notificationsByMessageId.has(notification.source_message_id)) {
        notificationsByMessageId.set(notification.source_message_id, notification);
      }
      return { error: null };
    },
  });

  const firstResult = await createMessageNotification(message.expediteur_id, message.id, dependencies);
  const retryResult = await createMessageNotification(message.expediteur_id, message.id, dependencies);

  assert.deepEqual(firstResult, { status: 200, body: { ok: true } });
  assert.deepEqual(retryResult, { status: 200, body: { ok: true } });
  assert.equal(upsertCalls, 2);
  assert.equal(notificationsByMessageId.size, 1);
});

test('SQL migration makes delivery idempotent and reserves message notifications for the server', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20261013150000_secure_message_notifications.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_message_id_uidx/);
  assert.match(migration, /AS RESTRICTIVE\s+FOR INSERT TO authenticated/);
  assert.match(migration, /AND type <> 'message'/);
  assert.match(migration, /REVOKE INSERT \(id, user_id, titre, contenu, type, lue, lien, created_at, source_message_id\)/);
  assert.match(migration, /GRANT INSERT \(user_id, titre, contenu, type, lue, lien\)/);
});

test('Edge adapter retains server-side authentication and the unique-key upsert', async () => {
  const edgeFunction = await readFile(
    new URL('../supabase/functions/message-notify/index.ts', import.meta.url),
    'utf8'
  );
  assert.match(edgeFunction, /authClient\.auth\.getUser\(\)/);
  assert.match(edgeFunction, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  assert.match(edgeFunction, /onConflict: 'source_message_id'/);
  assert.match(edgeFunction, /ignoreDuplicates: true/);
});

test('diagnoses network or CORS failures without revealing request details', () => {
  const error = new FunctionsFetchError(new TypeError('Failed to fetch'));
  const message = getSupabaseFunctionErrorMessage(error, 'message-notify');
  assert.match(message, /réseau ou CORS/);
  assert.match(message, /déployée/);
  assert.doesNotMatch(message, /Failed to fetch/);
});

test('distinguishes an undeployed function from JWT and server failures', () => {
  const notFound = getSupabaseFunctionErrorMessage(
    new FunctionsHttpError(new Response('{}', { status: 404 })),
    'message-notify'
  );
  assert.match(notFound, /introuvable/);
  assert.match(notFound, /HTTP 404/);

  const unauthorized = getSupabaseFunctionErrorMessage(
    new FunctionsHttpError(new Response('{}', { status: 401 })),
    'message-notify'
  );
  assert.match(unauthorized, /JWT/);

  const relayFailure = getSupabaseFunctionErrorMessage(
    new FunctionsRelayError(new Response('{}', { status: 503 })),
    'message-notify'
  );
  assert.match(relayFailure, /erreur serveur/);
  assert.match(relayFailure, /journaux Supabase/);
});
