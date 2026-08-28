# Provide a Reusable Paddle Sandbox Purchase Fixture

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Let a developer verify the real Paddle purchase path locally without rebuilding payment-page hosting, container overrides, authentication wiring, and webhook tunneling for every run. After this change, an opt-in Compose overlay serves a `Paddle.js` payment page, starts a temporary public webhook tunnel, configures the API for Paddle sandbox with local secret files, and documents one repeatable purchase and notification-replay procedure. A developer can observe a pending purchase become paid, the organization balance rise by exactly the configured credits, and a replay leave that balance unchanged.

## Progress

- [ ] (2026-08-28) Introduce the canonical checkout payment-link configuration with a compatible legacy alias.
- [ ] (2026-08-28) Add the opt-in Paddle checkout and webhook-tunnel Compose fixture.
- [ ] (2026-08-28) Document Paddle catalog and notification-destination lifecycle, local secrets, startup, authentication,
  purchase, replay, and cleanup.
- [ ] (2026-08-28) Complete one live sandbox purchase and notification replay and record redacted evidence.
- [ ] (2026-08-28) Run configuration, unit, Compose, build, full Jest, stub Bruno regression, and diff validation.

## Plan dependencies

- `payments/05`

## Surprises & Discoveries

- On 2026-08-28, the project owner installed the Paddle plugin and connected `paddle-sandbox`. An authenticated inventory found no active or archived products or prices. A write canary then created product `pro_01m12qn3y81cr37x0mv2ygkgf0` and one-time USD price `pri_01m12qn40atyzfsrapsw2gy9xc`, read both back, and archived the price followed by the product. Both finished with `archived` status, confirming product and price create and update access without leaving active catalog entries.
- Paddle notification destinations are durable account state, remain active after a Quick Tunnel stops, and are
  limited to ten active destinations. Creating a new destination on every run without deactivating the exact fixture
  destination is neither repeatable nor clean recovery.
- Each notification destination has its own signature secret. Deleting the local secret while leaving the destination
  active can make later deliveries unverifiable and leaves no safe identifier for targeted cleanup.

## Decision Log

- Decision: Ship the fixture as `docker/compose.paddle-dev.yaml`, separate from the base Compose stack.
  Rationale: Paddle requires account-bound credentials and a public tunnel. An opt-in overlay follows the existing SMTP fixture convention without making external payment infrastructure part of ordinary local startup.
  Date/Author: 2026-08-19, project owner and planning.
- Decision: Replace the misleading configuration name with canonical `PAYMENTS_CHECKOUT_URL` while accepting `PAYMENTS_CHECKOUT_RETURN_URL` as a deprecated alias.
  Rationale: Paddle's transaction `checkout.url` is the payment-link page where `Paddle.js` opens the transaction, not a post-payment return URL. Compatibility avoids breaking existing stub and developer configuration.
  Date/Author: 2026-08-19, project owner and planning.
- Decision: Canonical and legacy checkout variables may coexist only when their values are identical.
  Rationale: Silently choosing one of two different URLs would make checkout behavior depend on hidden precedence. A clear startup error keeps configuration deterministic.
  Date/Author: 2026-08-19, project planning.
- Decision: Inject Paddle credentials and the client-side token from gitignored `.dev/paddle/` files and inject the sandbox price id through an environment variable.
  Rationale: No account-specific credential or catalog identifier belongs in source control. A Paddle client-side token is safe in browser code but still belongs to the developer's sandbox account and should be supplied at runtime.
  Date/Author: 2026-08-19, project planning.
- Decision: Use `cloudflare/cloudflared:2026.7.2` as a development-only Quick Tunnel forwarding to host port 53000.
  Rationale: The pinned image makes the fixture reproducible, requires no Cloudflare account, and can start before the API so its temporary URL is available when creating the Paddle notification destination.
  Date/Author: 2026-08-19, project planning.
- Decision: Use the Paddle plugin for structured catalog and notification-destination lifecycle operations when its
  connected tools support them, and reuse matching catalog entities on repeated runs.
  Rationale: Catalog and notification settings are durable external state and benefit from list-before-write,
  identifier-based updates, and verified cleanup. The browser payment remains an intentional action.
  Date/Author: 2026-08-19, project owner and planning.
- Decision: Manage exactly one active notification destination owned by the current fixture run and deactivate it
  before stopping the tunnel or deleting local secrets.
  Rationale: The destination is durable external state while the Quick Tunnel URL is ephemeral. Deactivation stops
  retries, preserves delivery logs, and avoids consuming Paddle's active-destination limit after cleanup.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Persist the created notification-setting ID in `.dev/paddle/notification-setting-id.txt` beside its
  signature secret, and use an ownership description containing `LeadEmailFinder paddle-dev`.
  Rationale: Safe cleanup must target the exact destination created or adopted by this fixture and must never modify an
  unrelated account destination based only on URL or event subscriptions.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Reuse a matching managed destination only when its local ID and signature secret are both available;
  otherwise deactivate any stale managed destination before creating a replacement.
  Rationale: A matching description is not proof that the local secret belongs to that destination. Creating a new
  destination while leaving a stale one active duplicates deliveries and can make signature diagnosis ambiguous.
  Date/Author: 2026-08-28, Codex plan audit.
- Decision: Authenticate verification requests with the seeded M2M service credential and the container-internal Keycloak issuer.
  Rationale: The fixture verifies payment behavior, not BFF login. The existing service credential has `billing:read`, `billing:manage`, and `platform:admin`, while the base host-facing issuer is unreachable from the API container.
  Date/Author: 2026-08-19, project planning.

## Outcomes & Retrospective

Not started.

## Context and Orientation

Plans 01 through 05 provide idempotent grants, the payment-provider port, purchase endpoints, signed webhook ingestion, and the Paddle sandbox adapter. The base stack publishes the API on host port 53000, Bull Board already occupies port 54000, and the containerized API cannot validate M2M tokens against the base `localhost:58080` issuer. The SMTP development overlay demonstrates the repository convention for opt-in Compose fixtures and the container-internal `http://keycloak:8080/realms/lead-email-finder` issuer.

`CreditPurchaseService` currently reads `PAYMENTS_CHECKOUT_RETURN_URL` and passes it as `CheckoutInput.returnUrl`; the Paddle adapter passes that value as transaction `checkout.url`. The new canonical name must therefore be normalized before DTO validation and consumed consistently without changing the provider port in this plan.

Paddle checkout payment links append `_ptxn=<transaction-id>` to the configured page. A page that loads `Paddle.js` in sandbox mode and initializes it with a `test_...` client-side token automatically opens the transaction. The public `POST /v1/payments/webhook` route verifies the raw body and `Paddle-Signature`, marks a known purchase paid on `transaction.completed`, and grants through the idempotent credit ledger.

## Scope and Non-Goals

Add a reusable sandbox-only checkout and tunnel fixture, correct the checkout URL configuration contract compatibly, document provider setup, and record one successful purchase and replay. Do not change payment endpoints, the provider port, database schema, credit-pack semantics, production configuration, BFF login, refund handling, subscriptions, or customer management. Refunds remain plan `payments/06`.

## Plan of Work

Add `PAYMENTS_CHECKOUT_URL` to `EnvironmentVariablesDto` as the required canonical URL. Normalize the raw environment before DTO validation: copy the deprecated `PAYMENTS_CHECKOUT_RETURN_URL` into the canonical field only when the canonical field is absent; accept both when equal; reject both when different. Change `CreditPurchaseService` and the checked-in base Compose configuration to consume the canonical value. Keep the deprecated field documented and covered so external local configurations continue to boot.

Add `docker/compose.paddle-dev.yaml` and a small `docker/paddle-dev/` payment-page fixture. The overlay configures `PAYMENTS_PROVIDER=paddle`, `PADDLE_ENVIRONMENT=sandbox`, a one-pack catalog using `${PADDLE_STARTER_PRICE_ID}`, the canonical checkout URL, Paddle API and webhook secret files, and the container-internal Keycloak issuer. An Nginx service publishes the checkout on host port 57000 and renders a committed HTML template with a client-side token read from `/run/secrets`. The page loads `Paddle.js` directly from Paddle's CDN, selects sandbox before initialization, and uses overlay checkout defaults; it does not call `Checkout.open` with its own items or transaction id, so Paddle's `_ptxn` parameter remains authoritative.

Add a `paddle-webhook-tunnel` service using the pinned Cloudflare image. It forwards to `http://host.docker.internal:53000`, includes the Linux host-gateway mapping, has no API dependency, and runs in the foreground so a developer can start it first and copy its random `trycloudflare.com` URL. Document that the tunnel exposes the whole local API, changes URL on restart, and must be stopped after verification.

Extend the payment and local-development documentation. The setup creates `.dev/paddle/api-key.txt`,
`webhook-secret.txt`, `client-token.txt`, and `notification-setting-id.txt` with mode `0600`; exports
`PADDLE_STARTER_PRICE_ID`; starts the tunnel; lists existing notification destinations before any write; and creates
or safely reuses one Platform destination owned by the fixture for `transaction.completed`, `transaction.canceled`,
and `transaction.past_due`. It then starts the overlay and provisions and bootstraps Keycloak. Next, it mints one M2M
token, captures the starting balance, creates a `starter` purchase, completes Paddle checkout, checks purchase and
balance, and replays the original delivered notification.

The cleanup deactivates the exact recorded notification-setting ID and verifies it is inactive before stopping the
tunnel, stopping Compose, or deleting local secrets. If deactivation fails, retain the local ID and signature secret,
print recovery guidance, and do not claim cleanup complete. Never deactivate or delete unrelated destinations. Use
the Paddle plugin when notification-setting read/write tools are available; otherwise document the equivalent
dashboard or API steps while preserving the same ownership and verification rules.

Once the Paddle plugin is installed and connected with product and price read/write access, list existing sandbox catalog entities before writing. Reuse an active product carrying `custom_data.lefPackId=starter` and `credits=100` when its tax category is `saas`. Otherwise, create `LeadEmailFinder Starter Credits`, description `100 LeadEmailFinder email-verification credits`, type `standard`, tax category `saas`, and that custom data without altering unrelated entities. Reuse an active one-time USD 5.00 price fixed to quantity one; otherwise, create `Starter — 100 credits` with amount `500`, currency `USD`, `billing_cycle=null`, and quantity minimum and maximum one. Do not silently substitute another tax category if `saas` is unavailable.

Record only redacted runtime evidence in this ExecPlan: date, purchase UUID, suffixes of Paddle transaction, event, and notification ids, webhook HTTP status and acknowledgment, starting and paid balances, observed `+100` delta, replay result, unchanged replay balance, and final `PASS` or `FAIL`. Never record credentials, full customer/card data, the ephemeral tunnel URL, or a raw webhook body.

## Interfaces and Dependencies

New canonical configuration: `PAYMENTS_CHECKOUT_URL`. Deprecated compatible alias:
`PAYMENTS_CHECKOUT_RETURN_URL`. New local-only inputs: `PADDLE_STARTER_PRICE_ID`, notification-setting ID, and secret
files under `.dev/paddle/`. New development services: `paddle-checkout` on host port 57000 and
`paddle-webhook-tunnel`. New external sandbox lifecycle: one explicitly owned notification destination is active only
while the fixture runs. No endpoint, provider-port, or persistence interface changes. Depends on `payments/05` and
unlocks the live sandbox validation in `payments/06`.

## Acceptance Criteria

- The API starts with only `PAYMENTS_CHECKOUT_URL`, starts with only the legacy variable, and starts with both when their values match.
- The API fails to start clearly when neither checkout URL exists, either URL is invalid, or both values differ.
- The base stub stack continues to create its deterministic checkout using the canonical configuration.
- The opt-in overlay serves a checkout page on `http://localhost:57000/checkout.html` that initializes `Paddle.js` in sandbox mode from the runtime client-side token and contains no API key or unresolved template variable.
- The tunnel service can start without the API, prints a temporary HTTPS URL, and forwards Paddle requests to the API after it becomes healthy.
- No Paddle API key, webhook secret, client-side token, access token, account-specific price id, customer data, tunnel URL, or raw webhook body is tracked by Git.
- Repeated Paddle catalog setup reuses a matching starter product and price rather than creating duplicates and does not modify unrelated catalog entries.
- Repeated notification setup leaves at most one active `LeadEmailFinder paddle-dev` destination owned by the current
  fixture and never modifies an unrelated destination.
- Safe cleanup deactivates the exact recorded destination before the tunnel stops, preserves its delivery logs, and
  verifies that no fixture-owned destination remains active.
- Failed notification cleanup retains the local setting ID and signature secret and reports recovery steps rather
  than deleting the only information needed for safe cleanup.
- A real sandbox checkout starts as `pending`, receives a valid `transaction.completed` webhook with HTTP 200 and `{ "received": true }`, becomes `paid`, and increases the target organization's balance by exactly 100.
- Replaying the original delivered notification returns HTTP 200, leaves the purchase `paid`, and does not change the credited balance.
- The stub Bruno credit-purchase collection still passes all 11 requests after the configuration and fixture changes.

## Validation

Add focused environment and purchase-service tests for canonical-only, legacy-only, matching dual values, conflicting values, invalid values, missing values, and resolved checkout use. Run `corepack pnpm typecheck`, `corepack pnpm lint`, `TMPDIR=/tmp TMP=/tmp TEMP=/tmp corepack pnpm test --runInBand`, and `corepack pnpm build`.

With disposable `.dev/paddle/` files and a test price id, run `docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml config --quiet`. Start `paddle-checkout`, assert its health endpoint returns 200, and inspect the rendered HTML without printing the token. Start `paddle-webhook-tunnel` independently and confirm it emits an HTTPS Quick Tunnel URL. Start the full overlay and confirm API health and the effective `paddle` and `sandbox` selections without printing secrets.

Run the live workflow described above with Paddle's no-3DS sandbox card. Verify the notification delivery log,
purchase status, exact balance delta, and notification replay, then deactivate the recorded destination and confirm it
is inactive before stopping the tunnel. List active destinations after cleanup and prove there is no fixture-owned
active destination and no unrelated destination changed. Record only redacted evidence.

Restore the stub stack and run `/run/user/1000/fnm_multishells/125294_1787124153492/bin/bru run --env local
--sandbox developer` from `bruno/credit-purchases`; all 11 requests must pass. Finish with `git diff --check`, a
tracked-file secret scan, and `PLANS_DRY_RUN=true corepack pnpm plans:sync` to validate the dependency graph without
changing GitHub Project state.

## Idempotence and Recovery

Catalog setup lists before creating and reuses matching active entities. Paddle products and prices are durable
sandbox state; if this plan creates an unusable entity, archive only that explicitly identified entity rather than
changing an unrelated one. Notification setup also lists first. Reuse only the locally identified destination whose
secret is available, or deactivate stale fixture-owned destinations before creating one replacement. Creating a
checkout is not idempotent, so abandon unpaid duplicate transactions and use a fresh purchase ID for a retry.
Webhook replay is safe through the existing credit-grant reference.

Quick Tunnel URLs are ephemeral. When the tunnel restarts, update the exact locally recorded destination before
retrying. A missed completed event is recoverable by replaying the original notification after the API and tunnel are
healthy. Deactivate and verify the destination before stopping the tunnel. Delete `.dev/paddle/` only after successful
deactivation, then stop the overlay and restart the base stack to return to the stub provider. If cleanup is
interrupted, use the retained notification-setting ID to deactivate the destination before retrying or discarding
secrets. Development data remains disposable and uses TypeORM synchronization; no migration or backfill is
introduced.

## Artifacts and Notes

Record the final redacted live verification result here. Do not claim runtime validation until each command and external observation has completed successfully.

Readiness evidence recorded on 2026-08-28: Paddle plugin `0.1.0` is installed, the `paddle-sandbox` MCP server receives `PADDLE_SANDBOX_API_KEY`, and product and price listing succeeded with an empty catalog. A sandbox write canary created, retrieved, and archived product `pro_01m12qn3y81cr37x0mv2ygkgf0` and one-time USD price `pri_01m12qn40atyzfsrapsw2gy9xc`. This directly confirms the product and price write access required for catalog provisioning; both canary objects remain only as archived records.

Notification-destination lifecycle reference:
<https://developer.paddle.com/webhooks/about/notification-destinations/>.

## Plan readiness

Ready to implement.
