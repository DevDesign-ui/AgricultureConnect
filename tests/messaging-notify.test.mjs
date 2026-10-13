import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  isAuthorizedMessageSender,
  parseMessageId,
  toMessageNotification,
} from '../supabase/functions/_shared/message-notify.ts';

const message = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  expediteur_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  destinataire_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};

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
