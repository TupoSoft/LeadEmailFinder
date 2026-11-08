# Credit Purchases Collection

Bruno runs API requests with assertions. Provision this checkout's disposable stack with `PAYMENTS_PROVIDER=stub`,
then run:

```shell
corepack pnpm bruno:credit-purchases
```

The stub is a deterministic local payment simulator. The launcher verifies stack ownership, loads private API keys
and the webhook signing secret, and requires all 34 requests and a nonzero passing test count. Missing or skipped
execution fails. Set `COMPOSE_PROJECT_NAME` for a separately named stack. Secrets stay out of arguments and reports;
temporary reports are deleted.

## Required Behavior

The collection checks billing permissions, safe credit-pack fields, organization-scoped balances, purchase creation
and history, and paid/failed states. Signed webhooks—payment-provider notifications—grant credits only once;
tampered or malformed events are rejected. Replayed deductions and restorations must not change the balance twice.

`/v1/billing/summary` returns `{ balance, reserved, available }`: total credits, credits held for pending work, and
credits still spendable. An unrelated organization query must not override the authenticated organization's identity.
A separate customer with an active reservation proves both held-credit accounting and organization isolation.
The launcher releases that hold and restores the customer's original balance under the shared verification lock,
including after failures. Run it sequentially with other suites using that customer.

The local `starter` pack grants 100 credits for 500 USD minor units ($5). Each run leaves two synthetic purchases
in development history; signed adjustments restore the paid purchase's grant before completion. Clear history only
with an ownership-checked disposable reset.

## Paddle Sandbox Setup

The collection requires the stub and rejects a Paddle-configured stack before reading its signing secret or
creating a purchase. For the opt-in Paddle sandbox, see
[the setup and cleanup procedure](../../docker/paddle-dev/README.md). Never commit API keys, webhook secrets, or
customer transaction payloads.
