# Internal API Client, Error Mapping, and Credit Balance

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After this plan, the connector can call the real LeadEmailFinder API on a customer's behalf and translate its
responses — success and failure alike — into clean MCP tool results, proved end-to-end by one real capability:
`check_credit_balance`. A developer can observe this by calling `check_credit_balance` through
`@modelcontextprotocol/inspector` against a real dev-stack organization and seeing its actual `{balance, reserved,
available}`, and by observing that every one of the API's rejection shapes (unauthenticated, insufficient
credits, not found, validation failure, rate limited, service unavailable) becomes a clear, stable, non-leaking
tool error rather than a raw upstream body or an unhandled exception. This plan establishes the one shared
upstream client and error vocabulary that every later tool plan (`04`, `05`) reuses rather than each plan
inventing its own.

## Progress

- [x] (2026-09-20) Added `apps/mcp-server/src/lef-api/{client,errors}.ts` and their specs, and
      `apps/mcp-server/src/tools/check-credit-balance.ts` (+ spec), registered in `create-server.ts` in place
      of `ping`.
- [x] (2026-09-20) Threaded `apiBaseUrl` through `CreateAppOptions`/`main.ts` (new required `API_URL`
      environment variable, fail-fast like `OIDC_BACKCHANNEL_URL`), and widened
      `CUSTOMER_SERVICE_CLIENT_PERMISSIONS` to include `billing:read`.
- [x] (2026-09-20) Ran focused and full test suites, live-validated `check_credit_balance` against a real
      dev-stack organization, and reran two existing Bruno suites depending on the customer fixture. Recorded
      results below.

## Plan dependencies

- `mcp-connector/02`
- `mcp-connector-hardening/01`

## Surprises & Discoveries

- Retiring `ping` broke every existing spec that called it through the real `create-server.ts` (`create-server.spec.ts`,
  `main.spec.ts`'s routing/auth-gate/crash-regression suites, `request-origin.integration.spec.ts`). Suites whose
  actual subject is routing, origin gating, or the auth gate itself — not any particular tool's behavior — now
  substitute a trivial local `probe`/`echo-token` server via the same `jest.mock('./create-server.js', ...)`
  pattern already established, instead of depending on `check_credit_balance`'s own upstream API. Only
  `main.spec.ts`'s crash regression (a real forked, unmocked process) and the new `check-credit-balance.spec.ts`
  exercise the real tool.
- `apps/mcp-server`'s existing "one shared bearer-token function per request" design (`extra.authInfo?.token`,
  populated by `main.ts`'s auth gate before dispatch) made `LefApiClient`'s injected `getAccessToken` trivial: a
  tool handler just wraps the already-resolved token as `() => Promise.resolve(token)` and constructs a fresh
  `LefApiClient` per call. It never needs to call back into `TokenCache` itself, since the secret was never
  retained past the original grant.
- `web`'s Nginx (`docker/web.Dockerfile`/`docker/web/nginx.conf`) proxies `/v1/*` (and the other customer-facing
  path prefixes) straight through to `api`; `api` itself publishes no host port (`docker/compose.yaml` only
  `expose`s it internally). Confirmed directly rather than assumed: a bare host process reaches the real API
  through the *published `web` endpoint* (`loadDevelopmentStack`'s `apiUrl`), the same way Bruno and
  browser-live fixtures already do — not through any `api`-specific URL.
- Live-verified `check_credit_balance` returns byte-identical JSON to a direct `GET /v1/billing/summary` call
  using the same freshly-minted bearer token against the real dev-stack organization.
- `scripts/keycloak/customer-fixture.ts`'s `service_credentials` upsert (`ON CONFLICT ... DO UPDATE SET
  permissions = EXCLUDED.permissions`) means widening `CUSTOMER_SERVICE_CLIENT_PERMISSIONS` and rerunning
  `pnpm keycloak:seed-customer-fixture` updates the already-seeded credential's permissions in place — no
  recreation or `dev:reset` was needed. `scripts/bruno/customer-billing-read-fixture.mjs`'s existing
  `withBillingReadForCustomerFixture` (used by the `credit-purchases` collection) already guards for "the
  fixture already has `billing:read`" and becomes a no-op in that case, so the widening needed no changes there.
  Reran `bruno:credit-purchases` (34/34) and `bruno:async-verification` (22/22) live to confirm.

## Decision Log

- Decision: Hand-type request/response interfaces for the small, stable set of endpoints this connector calls,
  rather than reusing `packages/api-client`'s generated schema or generating a second OpenAPI-derived schema
  scoped to this package. Rationale: `packages/api-client`'s bundled schema is generated from `browser.json`,
  which is filtered through the frontend's own `BROWSER_OPERATIONS` allow-list and notably excludes sync
  `POST /verify` even though it is customer-facing; extending that allow-list would touch the frontend's own
  generated client for a need only this connector has. The full alternative (a second generation pipeline reading
  `runtime.json`, scoped to this package) is a legitimate option but adds a second generated-schema
  drift-check surface for a stable set of ~7 endpoints — hand-typing the request/response shapes directly against
  the module READMEs and DTOs is simpler and keeps this package fully decoupled from the frontend's own tooling.
  Date/Author: 2026-09-16, Codex planning.
- Decision: One shared `mapUpstreamError` function owns every HTTP-status-to-tool-error translation, called by
  every method on the API client wrapper rather than duplicated per tool. Rationale: consistent, auditable
  handling of exactly which fields are safe to surface (a stable code, a short message, an optional
  `retryAfterSeconds`) versus which must never be surfaced (the raw response body, any header other than
  `Retry-After`, any token). Date/Author: 2026-09-16, Codex planning.
- Decision: Widen `scripts/keycloak/customer-fixture.ts`'s `CUSTOMER_SERVICE_CLIENT_PERMISSIONS` to additionally
  include `billing:read`, in this plan rather than a later one. Rationale: this plan is the first one that needs
  to live-validate a `billing:read`-gated endpoint against the shared dev-stack customer fixture; deferring the
  widening to plan 07 would leave this plan's own acceptance criteria unverifiable end-to-end.
  Date/Author: 2026-09-16, Codex planning.
- Decision: Read the real API's base URL from `API_URL`, required with no default (fail-fast before opening a
  listener, mirroring `OIDC_BACKCHANNEL_URL`). Rationale: `API_URL` is already an established convention for "the
  callable API base URL from a host process" elsewhere in this repository's own dev-stack tooling
  (`scripts/keycloak/owned-browser-seed-stack.ts`, `scripts/testing/dev-reset.test.mjs`); reusing it avoids
  inventing a second name for the same concept. Date/Author: 2026-09-20, implementation.
- Decision: Construct a fresh `LefApiClient` inside each tool call, not once per `createServer()` invocation.
  Rationale: `createServer()` runs before the request body is parsed, so the per-request bearer token
  (`extra.authInfo.token`) is not yet available at that point; only the tool callback itself has it.
  Date/Author: 2026-09-20, implementation.

## Outcomes & Retrospective

Delivered exactly the scope this plan described: a hand-typed `LefApiClient` with one shared `mapUpstreamError`
covering all six documented status codes plus the unmapped/network-failure fallback, and one real tool,
`check_credit_balance`, replacing the scaffold's placeholder `ping`. Live-validated end to end against a real
dev-stack organization (byte-identical to a direct API call) and confirmed the additive permission widening left
two existing, customer-fixture-dependent Bruno suites passing unmodified. This is now the shared client/error
foundation `mcp-connector/04` and `05` extend with their own methods.

## Context and Orientation

All paths below are repository-relative.

This plan now also depends on `mcp-connector-hardening/01`, which corrects `mcp-connector/02`'s token-cache
identity (binding cache entries to the complete presented credential, not the client ID alone, closing a secret-
bypass gap). `LefApiClient`'s injected token accessor must be backed by that corrected cache, not the original
ID-only one, before this plan is implemented.

`GET /v1/billing/summary` (owned by `src/libs/modules/credits`, see its README) requires `billing:read` and
returns `{balance: number, reserved: number, available: number}` for the caller's own organization (resolved from
the authenticated principal, never a caller-supplied parameter). This is the simplest customer-facing endpoint in
the whole surface and the right one to prove the client/error plumbing against before building anything more
complex on top.

`scripts/keycloak/customer-fixture.ts` defines `CUSTOMER_SERVICE_CLIENT_ID` and
`CUSTOMER_SERVICE_CLIENT_PERMISSIONS` for the shared dev-stack customer fixture used by every existing
browser-live suite (via `browser-fixtures:bootstrap` and `scripts/bruno/async-verification-fixture.mjs`'s
`customerClientSecret` helper). Confirm its current permission list directly before editing — this plan's own
context notes say it currently covers `verification:run`/`verification:read` only; verify that against the file
itself rather than trusting this note, since it may have changed since this plan was written.

The connector's known error surfaces, per `src/libs/modules/email-verification/README.md` and
`src/libs/modules/credits/README.md`: `400` (single-request validation failure, e.g. malformed email or an
invalid UUID lookup parameter — code `validation_failed`, corrected by `mcp-connector-hardening/02`, which
originally miscategorized this as `422`), `401` (missing/invalid bearer — code `authentication_required`), `402`
(insufficient credits, thrown by `CreditGuard`), `403` (an authenticated credential missing a required
permission — code `permission_denied`, added by `mcp-connector-hardening/02`), `404` (not found / foreign
organization concealment), `422` (batch CSV upload validation failure — missing file, invalid media type, or
oversized upload; also mapped to `validation_failed`, the same code as `400`), `429`
(`VerificationRateLimitGuard`, includes a `Retry-After` header), `503` (`rate_limit_unavailable`, the limiter's
own fail-safe outage response). Any other status or a network-level throw (connection refused, timeout, DNS
failure) is an unexpected upstream error.

## Scope and Non-Goals

This plan adds the shared API client scaffold, the shared error mapper, and exactly one real tool
(`check_credit_balance`). It does not add verification tools (plan 04) or batch tools (plan 05) — those extend the
same client class with their own methods in their own plans, reusing this plan's error mapper unchanged. It does
not add Docker/Compose wiring.

## Plan of Work

Create `apps/mcp-server/src/lef-api/errors.ts` exporting a `mapUpstreamError(response: Response, body: unknown):
UpstreamError` function and its `UpstreamError` type (`{code: 'authentication_required' | 'insufficient_credits' |
'not_found' | 'validation_failed' | 'rate_limited' | 'service_unavailable' | 'unexpected_upstream_error', message:
string, retryAfterSeconds?: number}` — `mcp-connector-hardening/02` later adds `'permission_denied'` for `403`
and a `400 -> validation_failed` mapping this original text omitted), mapping each documented status to its code
with a short, fixed,
non-parameterized message per code (never interpolating the raw upstream body into the message) and extracting
`retryAfterSeconds` only from the `429`/`503` cases' `Retry-After` header when present. Export a second helper for
mapping a thrown network/transport error (never a `Response`) to `unexpected_upstream_error` without inspecting
its message for anything sensitive.

Create `apps/mcp-server/src/lef-api/client.ts` exporting a `LefApiClient` class: constructor takes the API base
URL and a function `() => Promise<string>` returning the current bearer token (backed by plan 02's `TokenCache`,
injected rather than constructed internally, so this class has no auth concerns of its own). Add one method,
`getBillingSummary(): Promise<{balance: number; reserved: number; available: number}>`, calling `GET
/v1/billing/summary` with the bearer token attached, and, on a non-2xx response, throwing an error carrying the
`UpstreamError` from `mapUpstreamError`.

Create `apps/mcp-server/src/lef-api/{client,errors}.spec.ts`: for `errors.spec.ts`, assert each of the six
documented status codes (plus one unmapped `5xx` and one simulated network throw) produces the correct `code` and
that the mapped `message` never contains a literal string present in a deliberately "sensitive-looking" fake
upstream body used only in the test fixture (proving the mapper genuinely discards the body rather than happening
to not include it in this one case); for `client.spec.ts`, use a fake `fetch` to assert `getBillingSummary` sends
the bearer token in the `Authorization` header, parses a successful response correctly, and rejects with the
mapped error on each failure status.

Create `apps/mcp-server/src/tools/check-credit-balance.ts` (+ `.spec.ts`): defines the tool's MCP registration
(name `check_credit_balance`, empty input schema, calls `LefApiClient.getBillingSummary()` using the current
request's resolved token from plan 02, returns the balance object as JSON text content on success, or an
`isError: true` text result built from the caught `UpstreamError` on failure — surfacing only `code`, `message`,
and `retryAfterSeconds` when present, never anything else).

Edit `apps/mcp-server/src/create-server.ts` to register `check_credit_balance` and retire the placeholder `ping`
tool from plans 01/02 (its job — proving the scaffold and the auth gate — is done).

Edit `scripts/keycloak/customer-fixture.ts` to add `'billing:read'` to `CUSTOMER_SERVICE_CLIENT_PERMISSIONS`,
confirming this is additive only (existing suites depending on this fixture assert their own required permissions
and are unaffected by a widened grant).

## Interfaces and Dependencies

New modules `apps/mcp-server/src/lef-api/{client,errors}.ts` and `apps/mcp-server/src/tools/check-credit-balance.ts`
plus their specs. One additive change to `scripts/keycloak/customer-fixture.ts`'s exported permission list.
Depends on `mcp-connector/02`'s per-request access token. Establishes the client/error shape `mcp-connector/04` and
`mcp-connector/05` extend.

## Acceptance Criteria

- `getBillingSummary` on a fake `fetch` returning each of `200`/`400`/`401`/`402`/`403`/`404`/`422`/`429`/`503`/an
  unmapped `5xx`/a thrown network error produces the correct success value or the correct `UpstreamError` code
  in every case (`mcp-connector-hardening/02` adds the `400`/`403` cases this original text omitted), and the
  `429`/`503` cases surface `retryAfterSeconds` when the fake response includes `Retry-After`.
- No test assertion's mapped error message contains the literal fixture body used to simulate the failure.
- `check_credit_balance` called through the connector with a valid credential returns real
  `{balance, reserved, available}` values.
- `check_credit_balance` called with a credential lacking `billing:read` (or an otherwise-rejected call) returns a
  clean `isError` tool result with the mapped code, not a raw `403`/`500` body or a stacktrace.
- Existing browser-live suites depending on `CUSTOMER_SERVICE_CLIENT_PERMISSIONS` still pass unmodified after the
  additive permission change.

## Validation

```sh
corepack pnpm exec jest --runInBand apps/mcp-server/src/lef-api/client.spec.ts apps/mcp-server/src/lef-api/errors.spec.ts apps/mcp-server/src/tools/check-credit-balance.spec.ts
corepack pnpm typecheck
corepack pnpm lint
```

Manual/live: against a real `dev:reset` stack, obtain the dev customer fixture's credential (now including
`billing:read`), run the connector, and call `check_credit_balance` via `@modelcontextprotocol/inspector --cli`,
confirming the returned balance matches what `GET /v1/billing/summary` returns directly for the same credential.
Rerun any existing browser-live suite that depends on `scripts/keycloak/customer-fixture.ts` to confirm it still
passes after the additive permission widening — name the exact suite(s) when implementing.

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector/03-api-client-error-mapping-credit-balance.md
```

## Idempotence and Recovery

No persisted state. Rerunning the connector or the tests is always safe. If the dev stack's fixture state
becomes inconsistent, `corepack pnpm dev:reset` restores it.

## Artifacts and Notes

Read `src/libs/modules/credits/README.md` for the exact current shape of `GET /v1/billing/summary` and confirm it
has not changed since this plan was written before implementing `getBillingSummary`.

## Plan readiness

Ready to implement
