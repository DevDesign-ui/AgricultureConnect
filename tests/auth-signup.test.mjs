import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getSignUpErrorMessage } from '../src/lib/signup-errors.ts';

const projectRoot = new URL('../', import.meta.url);
const readProjectFile = (path) => readFile(new URL(path, projectRoot), 'utf8');

test('shows the duplicate-email message only for explicit Supabase Auth error codes', () => {
  const expected = 'Cette adresse e-mail est déjà inscrite. Veuillez vous connecter ou utiliser une autre adresse.';

  assert.equal(getSignUpErrorMessage({ code: 'email_exists' }, null), expected);
  assert.equal(getSignUpErrorMessage({ code: 'user_already_exists' }, null), expected);
  assert.equal(getSignUpErrorMessage({ code: 'weak_password', message: 'Mot de passe invalide.' }, null), 'Mot de passe invalide.');
});

test('does not disclose Supabase responses that hide an existing email', () => {
  const message = getSignUpErrorMessage(null, { identities: [] });

  assert.match(message, /^Si cette adresse e-mail est nouvelle/);
  assert.doesNotMatch(message, /déjà inscrite/);
});

test('keeps new email signups pending confirmation', async () => {
  assert.equal(getSignUpErrorMessage(null, { identities: [{ provider: 'email' }] }), null);
  assert.equal(getSignUpErrorMessage(null, null), 'Impossible de créer votre compte pour le moment.');

  const authContext = await readProjectFile('src/context/AuthContext.tsx');
  assert.match(authContext, /Vérifiez votre e-mail pour confirmer votre compte/);
  assert.doesNotMatch(authContext, /\.from\(['"]profiles['"]\)\s*\.insert/);
});

test('normalizes profile emails, verifies Auth duplicates, and adds unique constraints without deleting accounts', async () => {
  const migration = await readProjectFile('supabase/migrations/20261103120000_enforce_unique_profile_email.sql');
  const config = await readProjectFile('supabase/config.toml');

  assert.match(migration, /FROM auth\.users[\s\S]*GROUP BY lower\(btrim\(email\)\)[\s\S]*HAVING count\(\*\) > 1/);
  assert.match(migration, /SET email = lower\(btrim\(auth_user\.email\)\)/);
  assert.match(migration, /ADD CONSTRAINT profiles_email_unique UNIQUE \(email\)/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_normalized_unique/);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+auth\.users/i);
  assert.match(config, /\[auth\.email\][\s\S]*enable_confirmations = true/);
});