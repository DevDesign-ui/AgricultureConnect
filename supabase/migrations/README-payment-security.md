# AgricultureConnect payment migration notes

## Scope and prerequisites

The migrations `20261009190000_secure_payment_attempts.sql` and
`20261009191000_payment_provider_and_history_hardening.sql` are local changes.
Their application state in any remote Supabase project is unknown and must be
checked by an authorized operator before deployment. They preserve existing
payment/order rows and keep legacy `valide` rows unverified.

Run both migrations, in timestamp order, first against a disposable database
restored from a recent snapshot. The migrations stop rather than rewriting or
deleting rows if they find duplicate references, idempotency keys, provider
events, unsupported statuses/methods, or multiple open attempts for one order.
Review those rows manually; never delete payment history merely to unblock an
index. Confirm the live schema matches the repository before considering a
rollout.

The migration removes direct `anon`/`authenticated` INSERT, UPDATE and DELETE
access. Payment reads retain the owner/participant rule and expose no provider
checkout URL, provider token, or idempotency key to browser clients. New
attempts are created only by the server, use `paydunya_checkout`, start as
`initie`, have a unique reference/idempotency key, match persisted order items
and the stored XOF order total, and are restricted to the buyer of a payable
order. A partial unique index allows only one open attempt per order.

The corrective migration deliberately replaces every existing `payments`
RLS policy with the participant-read policy above. Before applying it to any
environment, inspect that environment's active policies and confirm no
approved admin, accounting, or support workflow depends on broader payment
reads. No such payment-reader workflow appears in the checked-in UI; remote
policies cannot be inspected from this local workspace.

The corrective migration changes `payments.commande_id` from `ON DELETE
CASCADE` to `ON DELETE RESTRICT`. Orders with payment history can no longer be
deleted; no existing row is removed. This behavior is intentional to preserve
the financial audit trail.

The server code is prepared for PayDunya hosted checkout and IPN. It requires
the Edge Function secrets `SUPABASE_SERVICE_ROLE_KEY`, `PAYDUNYA_MASTER_KEY`,
`PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_TOKEN`, `PAYDUNYA_API_BASE_URL`,
`PAYDUNYA_CALLBACK_URL`, and `PAYDUNYA_RETURN_URL`. Use test credentials first
and confirm the sandbox API base URL from the merchant dashboard/documentation;
the code only allows HTTPS on `app.paydunya.com` with `/api/v1` or
`/sandbox-api/v1`. Never put merchant or service-role keys in Vite variables.

The notification function checks PayDunya's documented IPN hash and then
performs the official server-to-server `GET
.../checkout-invoice/confirm/[invoice_token]` request using merchant API keys.
It verifies the confirmation response hash, invoice token, persisted amount,
and provider status before applying a guarded, idempotent transition. The
callback's claimed status and the browser return URL are never treated as
confirmation evidence. Only the trusted `service_role` path can set provider
evidence. The `payment-notify` function is configured without Supabase JWT
verification because PayDunya sends its own notification; it must remain
protected by its provider authentication and server confirmation checks.

The verified payment status and `orders.payment_status = 'paye'` are applied
in one restricted server-side database function/transaction. The order field
defaults to `non_paye`; historical payment rows are not reclassified as paid.
The order's business/fulfillment status remains unchanged.

## Verification and legacy records

Existing amounts, owners, references and statuses are not rewritten. Existing
`valide` payments receive `provider_confirmation_verified = false` and are
shown as unverified; non-empty metadata alone is not proof. Existing payment
rows remain readable to the same participants. The trigger blocks client
writes, protects immutable fields and permits a new `valide` transition only
with provider token, event ID, timestamp and server verification flag.

RLS remains enabled; authenticated users receive column-level SELECT on the
fields used by the UI, not mutation rights or provider session secrets. The
service-role key remains privileged and must never reach the browser. The
migrations were executed against an isolated, disposable PostgreSQL 18 database
with a fixture matching the tables and roles used by the SQL. The checks covered
buyer/seller/third-party reads, client write denial, verified and duplicate
confirmations, amount mismatch, open-attempt uniqueness, historic rows, and
`ON DELETE RESTRICT`. This was not a full Supabase local-stack test; verify the
actual schema, grants, JWT claims, and function exposure in a disposable Supabase
project before any remote rollout.

## PayDunya availability and prerequisites

PayDunya's official [French documentation](https://developers.paydunya.com/doc/FR/)
and its [HTTP/JSON integration guide](https://developers.paydunya.com/doc/FR/http_json)
list `card`, `orange-money-senegal`, `wave-senegal`, and
`free-money-senegal` among available operators and documents hosted invoice
creation, sandbox endpoints, IPN notifications, and the invoice confirmation
endpoint. Availability depends on merchant account activation. The
documentation's SoftPay card path warns that direct card
processing requires PCI-DSS certification; this integration uses hosted
checkout and does not collect card details. Confirm card eligibility and
enabled channels with PayDunya before advertising them.

Required before a sandbox test: an activated PayDunya Business account, test
application credentials, a reachable HTTPS callback and return URL, deployed
Edge Functions in a non-production Supabase project, and the migrations applied
to a disposable/test database. No credentials were supplied, no function was
deployed, and no real or sandbox transaction was attempted here.

## Rollback procedure

Do not restore `ON DELETE CASCADE` or the former client write policies. A
production rollback must be a reviewed forward-fix that keeps RLS/write
restrictions and preserves all payment rows and provider metadata. Dropping
provider columns or loosening the confirmation trigger after live payments
exist can lose evidence or permit forgery. For a disposable test database
only, use a snapshot restore; do not use a destructive down migration against
production data.
