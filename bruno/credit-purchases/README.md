# Credit Purchases Collection

This Bruno API-request collection requires a provisioned disposable stack with `PAYMENTS_PROVIDER=stub`.
Configure the credentials, webhook signing secret, organization, and held-credit fixture listed in
`environments/local.yml`. Run sequentially with other collections using the same customer and restore its balance
and reservations afterward.

The stub is a deterministic local payment simulator.

## Required Behavior

The collection checks billing permissions, safe credit-pack fields, organization-scoped balances, purchase creation
and history, and paid/failed states. Signed webhooks—payment-provider notifications—grant credits only once;
tampered or malformed events are rejected. Replayed deductions and restorations must not change the balance twice.

`/v1/billing/summary` returns `{ balance, reserved, available }`: total credits, credits held for pending work, and
credits still spendable. An unrelated organization query must not override the authenticated organization's identity.
A separate customer with an active reservation proves both held-credit accounting and organization isolation.

The local `starter` pack grants 100 credits for 500 USD minor units ($5). Each run leaves two synthetic purchases
in development history; signed adjustments restore the paid purchase's grant before completion. Clear history only
in an owned disposable database.

Use this collection only with the stub provider. Paddle requires separately provisioned sandbox checkout and webhook
delivery; see the [payment configuration](../../apps/api/src/modules/payments/README.md#configuration).
Never commit API keys, webhook secrets, or customer transaction payloads.
