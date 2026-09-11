# Credit Purchases Bruno Collection

This 34-request collection verifies customer billing reads, credit-pack checkout, and signed webhook processing
against the local stub payment provider. It covers unauthenticated reads and purchases, safe catalog fields and order,
current-organization balance, purchase creation and history, and paid and failed states. It also verifies one-time
credit granting, tampered-body and signed malformed-event rejection, full credit clawback and replay, and inverse
restoration and replay. Every balance transition is read through the authenticated customer billing summary, which
now reports `{ balance, reserved, available }`.

Start and provision the development stack owned by this checkout with `PAYMENTS_PROVIDER=stub`, then run:

```shell
corepack pnpm bruno:credit-purchases
```

For an isolated stack, supply its Compose project name through `COMPOSE_PROJECT_NAME`. The launcher checks the running
containers and published endpoints, bootstraps the local development service credential, and reads the configured stub
webhook secret without printing it. It invokes the repository-pinned Bruno CLI 4.1.0 from this collection root with
`bru run --env local --sandbox developer`. It requires all 34 requests and a nonzero passing test count, rejects skipped
requests, and deletes temporary reports. Credentials and webhook secrets stay out of command arguments and reports.

The bootstrapped service client has `billing:read`, `billing:manage`, and `platform:admin`. The collection reads its own
organization through `/v1/billing/summary`, including a request carrying an unrelated organization query value to
verify that the principal remains authoritative. API tests cover authenticated callers without billing permission.
The deterministic stub event fixture derives its internal correlation value from the purchase UUID; it never obtains
provider details from the customer history or return URL.

Before the collection runs, the launcher gives the separately seeded, isolated customer fixture organization (the
same one `bruno/async-verification` and `bruno/batch-verification` use) a known balance and a real reservation hold
through `CreditReservationService`, mirroring the reservation-store construction in the platform-credits launcher —
a short-lived Nest application context built from `IdentityModule`, never raw SQL. The final request in the
collection reads that organization's billing summary with its own client-credentials token and asserts its
`balance`/`reserved`/`available` reflect the hold, and that its balance differs from the unrelated platform
organization the rest of the collection exercises — proving both the accounting and the organization isolation.
The launcher releases the hold and restores the customer organization's original balance afterward, under the same
exclusive lock `bruno/async-verification` uses to avoid a concurrent balance race, regardless of collection outcome.

The checked-in local Compose catalog defines the `starter` pack as 100 credits for 500 USD minor units. The collection
creates two synthetic purchases on each run and leaves their paid and failed history in the disposable development
organization. Signed adjustment requests restore the paid purchase's granted balance before completion. Use the
documented disposable reset to clear the fixture history after confirming stack ownership.

## Paddle Sandbox Setup

Use the Paddle adapter only with a sandbox account. The opt-in Compose fixture and the complete catalog, secret,
tunnel, authentication, checkout, notification-replay, and cleanup procedure live in
[`docker/paddle-dev/README.md`](../../docker/paddle-dev/README.md).

The checked-in Bruno requests target the deterministic stub and require no Paddle account. The launcher rejects a
Paddle-configured stack before reading the signing secret or creating a purchase. Never commit keys, notification
secrets, or customer transaction payloads.
