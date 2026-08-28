# Provide a Reusable Paddle Sandbox Purchase Fixture

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Let a developer verify the real Paddle purchase path locally without rebuilding payment-page hosting, container
overrides, authentication wiring, and webhook tunneling for every run. After this change, an opt-in Compose overlay
serves a `Paddle.js` payment page, starts one temporary public checkout-and-webhook tunnel, configures the API for
Paddle sandbox with local secret files, and documents one repeatable purchase and notification-replay procedure. A
developer can observe a pending purchase become paid, the organization balance rise by exactly the configured
credits, and a replay leave that balance unchanged.

## Progress

- [x] (2026-08-28) Introduce the canonical checkout payment-link configuration with a compatible legacy alias.
- [x] (2026-08-28) Add the opt-in Paddle checkout and webhook-tunnel Compose fixture.
- [x] (2026-08-28) Document Paddle catalog and notification-destination lifecycle, local secrets, startup,
  authentication, purchase, replay, and cleanup.
- [x] (2026-08-28) Complete one live sandbox purchase and notification replay and record redacted evidence.
- [x] (2026-08-28) Run configuration, unit, Compose, build, full Jest, stub Bruno regression, and diff validation.
- [x] (2026-08-28) Deactivate the exact fixture-owned notification destination and verify safe cleanup.

## Plan dependencies

- `payments/05`

## Surprises & Discoveries

- On 2026-08-28, the project owner installed the Paddle plugin and connected `paddle-sandbox`. An authenticated inventory found no active or archived products or prices. A write canary then created a product ending in `ygkgf0` and one-time USD price ending in `gy9xc`, read both back, and archived the price followed by the product. Both finished with `archived` status, confirming product and price create and update access without leaving active catalog entries.
- On 2026-08-28, implementation-time catalog provisioning found zero active products, created the exact starter product and price, then reran the same inventory-first procedure. The second run reused one matching product ending in `27e136` and one matching price ending in `w8q6y9`; both matching counts were exactly one.
- On 2026-08-28, `.dev/paddle/api-key.txt`, `webhook-secret.txt`, and `client-token.txt` were absent. Disposable placeholder values were sufficient for Compose and payment-page rendering checks, but a real Paddle transaction and notification delivery cannot run without developer-supplied sandbox values.
- On 2026-08-28, the running `LEF` Compose project belonged to `/home/kyrylo/Projects/TupoSoft/LeadEmailFinder/docker`, not this worktree. Payment-page runtime validation therefore used isolated project `lef-paddle-372`; starting the Quick Tunnel was deliberately skipped because it would have exposed the other checkout's API on host port 53000.
- On 2026-08-28, GitHub issue #372 was already assigned to the project owner. The active GitHub token lacked `project` and `read:project`, so the required project-9 Status update could not be performed; implementation continued after skipping only that board-field mutation.
- On 2026-08-28, live sandbox transaction preview succeeded for the configured USD 5.00 price, but transaction creation rejected `http://localhost:57000/checkout.html` with `transaction_checkout_url_domain_is_not_approved`. Paddle's Website approval form also rejected bare `localhost` as an invalid domain. The fixture therefore needs its temporary HTTPS hostname for the checkout URL as well as the webhook destination.
- Paddle notification destinations are durable account state, remain active after a Quick Tunnel stops, and are
  limited to ten active destinations. Creating a new destination on every run without deactivating the exact fixture
  destination is neither repeatable nor clean recovery.
- Each notification destination has its own signature secret. Deleting the local secret while leaving the destination
  active can make later deliveries unverifiable and leaves no safe identifier for targeted cleanup.
- On 2026-08-28, restoring the base stub stack after the Paddle overlay required rerunning the idempotent Keycloak
  provisioning command before credential bootstrap. The overlay had written the container-internal issuer to the
  generated service-client file, so bootstrapping that file alone seeded the same internal issuer twice and
  host-minted tokens remained unknown to the API.

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
- Decision: Use `cloudflare/cloudflared:2026.7.2` as a development-only Quick Tunnel forwarding to the checkout Nginx service, which serves the payment page and proxies only the exact webhook path to the API.
  Rationale: The pinned image makes the fixture reproducible, requires no Cloudflare account, and provides the fully qualified HTTPS domain Paddle requires for transaction checkout URLs. Routing through Nginx exposes only the checkout, health, and webhook paths instead of the whole local API.
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
- Decision: Render the client-side token through a dedicated, fail-closed payment-page entry point before starting Nginx.
  Rationale: Compose secrets are files rather than environment variables. A small entry point can validate the sandbox token prefix, substitute only that token, reject an unresolved template, and avoid printing the rendered page or secret.
  Date/Author: 2026-08-28, implementation.

## Outcomes & Retrospective

The canonical checkout setting, compatibility normalization, opt-in Compose services, sandbox catalog, and full
operator procedure are implemented. Focused configuration and payment tests, isolated checkout rendering, and
the repository-wide regression commands and stub Bruno workflow pass. Developer-supplied sandbox secrets enabled
account-bound testing, which revealed and corrected Paddle's public-domain requirement. A live sandbox purchase
then moved from pending to paid, granted exactly 100 credits, and accepted a replay without granting again. The
project owner confirmed that the exact Platform notification destination ending in `h61dbq` was inactive after
cleanup. The Paddle overlay was stopped without deleting shared volumes, the base stub stack was restored, and its
credit-purchase regression passed. The fixture outcome is `PASS`.

## Context and Orientation

Plans 01 through 05 provide idempotent grants, the payment-provider port, purchase endpoints, signed webhook ingestion, and the Paddle sandbox adapter. The base stack publishes the API on host port 53000, Bull Board already occupies port 54000, and the containerized API cannot validate M2M tokens against the base `localhost:58080` issuer. The SMTP development overlay demonstrates the repository convention for opt-in Compose fixtures and the container-internal `http://keycloak:8080/realms/lead-email-finder` issuer.

`CreditPurchaseService` currently reads `PAYMENTS_CHECKOUT_RETURN_URL` and passes it as `CheckoutInput.returnUrl`; the Paddle adapter passes that value as transaction `checkout.url`. The new canonical name must therefore be normalized before DTO validation and consumed consistently without changing the provider port in this plan.

Paddle checkout payment links append `_ptxn=<transaction-id>` to the configured page. A page that loads `Paddle.js` in sandbox mode and initializes it with a `test_...` client-side token automatically opens the transaction. The public `POST /v1/payments/webhook` route verifies the raw body and `Paddle-Signature`, marks a known purchase paid on `transaction.completed`, and grants through the idempotent credit ledger.

## Scope and Non-Goals

Add a reusable sandbox-only checkout and tunnel fixture, correct the checkout URL configuration contract compatibly, document provider setup, and record one successful purchase and replay. Do not change payment endpoints, the provider port, database schema, credit-pack semantics, production configuration, BFF login, refund handling, subscriptions, or customer management. Refunds remain plan `payments/06`.

## Plan of Work

Add `PAYMENTS_CHECKOUT_URL` to `EnvironmentVariablesDto` as the required canonical URL. Normalize the raw environment before DTO validation: copy the deprecated `PAYMENTS_CHECKOUT_RETURN_URL` into the canonical field only when the canonical field is absent; accept both when equal; reject both when different. Change `CreditPurchaseService` and the checked-in base Compose configuration to consume the canonical value. Keep the deprecated field documented and covered so external local configurations continue to boot.

Add `docker/compose.paddle-dev.yaml` and a small `docker/paddle-dev/` payment-page fixture. The overlay configures `PAYMENTS_PROVIDER=paddle`, `PADDLE_ENVIRONMENT=sandbox`, a one-pack catalog using `${PADDLE_STARTER_PRICE_ID}`, the canonical checkout URL, Paddle API and webhook secret files, and the container-internal Keycloak issuer. An Nginx service publishes the checkout on host port 57000 and renders a committed HTML template with a client-side token read from `/run/secrets`. The page loads `Paddle.js` directly from Paddle's CDN, selects sandbox before initialization, and uses overlay checkout defaults; it does not call `Checkout.open` with its own items or transaction id, so Paddle's `_ptxn` parameter remains authoritative.

Add a `paddle-webhook-tunnel` service using the pinned Cloudflare image. It forwards to the checkout service, depends only on that service becoming healthy, and runs in the foreground so a developer can start it first and copy its random `trycloudflare.com` URL. The checkout Nginx configuration serves `/checkout.html` and `/health`, proxies only the exact `/v1/payments/webhook` path to the API through Docker DNS, and returns 404 for every other path. Document that the tunnel changes URL on restart and must be stopped after verification.

Extend the payment and local-development documentation. The setup creates `.dev/paddle/api-key.txt`,
`webhook-secret.txt`, `client-token.txt`, and `notification-setting-id.txt` with mode `0600`. It exports
`PADDLE_STARTER_PRICE_ID` and the public checkout URL, starts the tunnel, approves its hostname, and configures the
default payment link. Before any notification write, it lists existing destinations. It then creates or safely
reuses one fixture-owned Platform destination for `transaction.completed`, `transaction.canceled`, and
`transaction.past_due`. Next, it starts the overlay. It provisions and bootstraps Keycloak, then mints one M2M token.
It captures the starting balance, creates a `starter` purchase, completes Paddle checkout, checks purchase and
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
`PAYMENTS_CHECKOUT_RETURN_URL`. New local-only inputs: `PADDLE_STARTER_PRICE_ID`, `PADDLE_CHECKOUT_URL`,
notification-setting ID, and secret files under `.dev/paddle/`. New development services: `paddle-checkout` on host port 57000 and
`paddle-webhook-tunnel`. New external sandbox lifecycle: one explicitly owned notification destination is active only
while the fixture runs. No endpoint, provider-port, or persistence interface changes. Depends on `payments/05` and
unlocks the live sandbox validation in `payments/06`.

## Acceptance Criteria

- The API starts with only `PAYMENTS_CHECKOUT_URL`, starts with only the legacy variable, and starts with both when their values match.
- The API fails to start clearly when neither checkout URL exists, either URL is invalid, or both values differ.
- The base stub stack continues to create its deterministic checkout using the canonical configuration.
- The opt-in overlay serves a checkout page on `http://localhost:57000/checkout.html` that initializes `Paddle.js` in sandbox mode from the runtime client-side token and contains no API key or unresolved template variable.
- The tunnel service can start without the API, prints a temporary HTTPS URL, serves the checkout page, proxies the
  exact webhook route after the API becomes healthy, and returns 404 for unrelated API routes.
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

With disposable `.dev/paddle/` files and a test price id, run `docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml config --quiet`. Start `paddle-checkout`, assert its health endpoint returns 200, inspect the rendered HTML without printing the token, confirm the exact webhook route reaches the API, and confirm unrelated API routes return 404. Start `paddle-webhook-tunnel` independently and confirm it emits an HTTPS Quick Tunnel URL and has only the checkout dependency. Start the full overlay with the public `PADDLE_CHECKOUT_URL` and confirm API health and the effective `paddle` and `sandbox` selections without printing secrets.

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

Quick Tunnel URLs are ephemeral. When the tunnel restarts, approve the new hostname and update the default payment
link, `PADDLE_CHECKOUT_URL`, and the exact locally recorded destination before retrying. A missed completed event is
recoverable by replaying the original notification after the API and tunnel are healthy. Deactivate and verify the
destination before stopping the tunnel. Delete `.dev/paddle/` only after successful deactivation, then stop the
overlay and restart the base stack to return to the stub provider. If cleanup is interrupted, use the retained
notification-setting ID to deactivate the destination before retrying or discarding secrets. Development data remains
disposable and uses TypeORM synchronization; no migration or backfill is introduced.

## Artifacts and Notes

Record the final redacted live verification result here. Do not claim runtime validation until each command and external observation has completed successfully.

Readiness evidence recorded on 2026-08-28: Paddle plugin `0.1.0` is installed, the `paddle-sandbox` MCP server receives `PADDLE_SANDBOX_API_KEY`, and product and price listing succeeded with an empty catalog. A sandbox write canary created, retrieved, and archived a product ending in `ygkgf0` and one-time USD price ending in `gy9xc`. This directly confirms the product and price write access required for catalog provisioning; both canary objects remain only as archived records.

Notification-destination lifecycle reference:
<https://developer.paddle.com/webhooks/about/notification-destinations/>.

Implementation validation recorded on 2026-08-28:

- `COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm typecheck` passed.
- The focused environment, purchase-service, and payment-module Jest run passed 3 suites and 44 tests.
- `COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm lint` passed with two preexisting explicit-return-type warnings outside the changed files.
- `COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm build` passed, compiling 445 files with no type-checker issues.
- `COREPACK_HOME=/tmp/lef-corepack TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test --runInBand` passed 129 suites and 840 tests; 9 suites and 27 tests were skipped, and 1 test remains pending.
- `docker compose -f docker/compose.yaml -f docker/compose.paddle-dev.yaml config --quiet` passed with disposable placeholder files and a test price identifier. The effective model selected `paddle`, `sandbox`, the canonical checkout URL, and the container-internal issuer; the tunnel had no API dependency.
- Isolated project `lef-paddle-372` served `/health` and `/checkout.html`, became healthy after using the IPv4 loopback probe, rendered the sandbox client-side token, left no unresolved token placeholder, and exposed no API or webhook secret. The isolated project was removed afterward.
- `cloudflare/cloudflared:2026.7.2` resolved to the expected version, and its `tunnel` command accepted both `--no-autoupdate` and `--url`. A live Quick Tunnel was not started because host port 53000 belonged to another checkout's running API.
- Repeated Paddle catalog provisioning reused exactly one matching active starter product ending in `27e136` and one matching price ending in `w8q6y9`.
- The stub credit-purchase Bruno collection passed 11 of 11 requests and tests against the disposable running stack, including webhook replay and tampered-body rejection.
- `COREPACK_HOME=/tmp/lef-corepack corepack pnpm docs:lint -- README.md bruno/credit-purchases/README.md docker/paddle-dev/README.md src/libs/modules/payments/README.md .agents/plans/payments/07-paddle-sandbox-purchase-fixture.md` passed all five files.
- `PLANS_DRY_RUN=true COREPACK_HOME=/tmp/lef-corepack corepack pnpm plans:sync`, `git diff --check`, the changed-file secret scan, and the `.dev/paddle/` ignore checks passed.
- During initial implementation, a real checkout, webhook delivery, exact `+100` live balance proof, and notification replay could not run because all three `.dev/paddle/` sandbox files were absent.
- After the sandbox secret files became available, the API key listed transactions successfully and transaction preview returned USD 5.00 for the configured price. Transaction creation reached Paddle but rejected the local checkout URL as an unapproved domain; no provider transaction was created.
- After routing the Quick Tunnel through the checkout gateway, both local and public probes returned 200 for health and checkout, 400 for an unsigned exact webhook request, and 404 for an unrelated API route. The effective Compose model used the public checkout URL, targeted `http://paddle-checkout:80`, depended only on the checkout service, and contained no host-gateway mapping. `nginx -t` and `git diff --check` passed.
- Live verification completed on 2026-08-28 for purchase `ab5a60e5-0ed7-4a40-9c54-1b9a8d0d2026` and Paddle transaction ending in `p40xde`. The purchase started `pending`; the original Paddle delivery reached the gateway at 13:08:39 UTC and returned HTTP 200 with a 17-byte acknowledgment body. The purchase became `paid`, and the balance moved from 0 to 100 for an exact `+100` delta.
- The original notification was replayed from the Paddle dashboard. The second Paddle delivery reached the gateway at 13:10:58 UTC and returned HTTP 200 with the same 17-byte acknowledgment body. The purchase remained `paid`, the balance remained 100, and the replay delta was exactly zero. Final live result: `PASS`.
- Both the connected Paddle plugin key and the developer-supplied API key returned HTTP 403 for notification listing, so event and notification ID suffixes were unavailable programmatically. No raw webhook body or customer data was logged or copied into the repository; the two Paddle-originated gateway deliveries and application state provide the replay evidence.
- After merging current `master`, typecheck and build passed, lint passed with the same two preexisting warnings, and
  the full Jest run passed 130 suites and 843 tests; 9 suites and 27 tests were skipped, and 1 test remains pending.
  The merged Compose model, Harper documentation lint, and `git diff --check` also passed.
- After Paddle verification, the project owner confirmed in the sandbox dashboard that the exact Platform
  notification destination ending in `h61dbq` was inactive. The Paddle checkout and tunnel containers were absent,
  the base API reported `PAYMENTS_PROVIDER=stub`, and its health endpoint returned 200. No unrelated destination was
  changed.
- The first Bruno attempt after cleanup exposed the generated Keycloak issuer mismatch described above. After the
  documented idempotent `keycloak:provision` and `keycloak:bootstrap-credential` recovery, the authenticated smoke
  request returned 200 and Bruno CLI 4.0.0 passed all 11 requests and all 11 tests, including paid-webhook replay and
  tampered-body rejection.

## Plan readiness

Complete.
