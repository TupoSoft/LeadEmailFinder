# Harden Authorization Callbacks

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

Make the browser authorization response one-shot and recoverable before frontend generation begins. Missing or bad
provider parameters, expired state, and account failures covered by the contract redirect to one same-origin error
route with a stable safe code. Two concurrent requests cannot exchange the same authorization code from one pending
login, and raw provider or exception details never enter the browser URL.

## Progress

- [x] (2026-09-05) Replaced pending-login-state read/delete with one atomic consume operation.
- [x] (2026-09-05) Moved provider-query validation inside the authorization-response boundary.
- [x] (2026-09-05) Mapped recoverable failures to stable same-origin redirects and cleared transient state.
- [x] (2026-09-05) Added concurrent replay, status, redirect, cookie, and redaction coverage.
- [x] (2026-09-05) Updated source Swagger annotations, module documentation, and Bruno coverage.
- [x] (2026-09-05) Ran focused, live-provider, Bruno, architecture, prose, build, and repository validation.

## Plan dependencies

- `frontend/02`
- `frontend/03`
- `auth/06`
- `auth/12`

## Surprises & Discoveries

- The application port and callback flow already exposed and called `consume`; only the Redis adapter implemented
  that contract as separate `GET` and `DEL` commands, which did not make first-consumer-wins behavior atomic.
- The global validation pipe previously rejected missing `code` or `state` before the controller ran, so a missing
  provider query returned `400` and could not reach a controller redirect mapper.
- `ExternalIdentityResolver.resolveOrCreate` created an identity before active-membership resolution. That left an
  identity or updated email behind on an `active_membership_required` redirect, contrary to this plan's recovery
  guarantee.
- Cookie parsing decoded every fragment without a failure boundary. One malformed percent escape, including in an
  unrelated cookie, could turn the callback into an unexpected `500`.
- The configured JOSE audience check accepts the configured client when it appears among multiple audiences. Without
  an explicit trusted co-audience policy, the callback needs a stricter single-audience and authorized-party check.

## Decision Log

- Decision: Consume pending login state with Redis `GETDEL` or one equivalent Lua operation before provider exchange.
  Rationale: One-time state and replay rejection are concurrency properties that separate read/delete calls do not
  provide.
  Date/Author: 2026-08-31, project planning.
- Decision: Parse the raw authorization-response query through a route-local non-throwing parser instead of a global
  DTO that rejects provider shapes covered by the contract first.
  Rationale: Missing, repeated, and malformed query failures must reach the same safe redirect policy instead of
  being intercepted by the global validation pipe as an HTML-hostile `400` response.
  Date/Author: 2026-08-31, project planning.
- Decision: Redirect recoverable failures to `/auth/error` on `APP_BASE_URL` with exactly
  `login_state_invalid`, `authorization_code_exchange_failed`, or `active_membership_required` in `code`.
  Rationale: The browser needs stable recovery categories, not provider payloads, exception messages, or internal
  identity details in its URL.
  Date/Author: 2026-08-31, project planning.
- Decision: Consume state before testing the authorization code and clear the transient state cookie on every
  documented success or failure path.
  Rationale: A request with valid state but no code is still a completed one-time response and must not leave a replay
  handle or stale browser cookie.
  Date/Author: 2026-08-31, project planning.
- Decision: Map only a typed provider OAuth rejection for the authorization-code grant to
  `authorization_code_exchange_failed`. Network failures, requests that time out, `429`, provider `5xx`, invalid JSON, client
  authentication/configuration failures, malformed successful token responses, and ID-token verification failures
  remain redacted server errors.
  Rationale: A stable browser recovery code must not misclassify an infrastructure or server-configuration failure
  as a user authorization rejection.
  Date/Author: 2026-08-31, project planning.
- Decision: Leave unexpected programming and infrastructure failures as redacted server errors.
  Rationale: Converting every exception into a benign redirect would hide outages and make operations failures
  indistinguishable from user-recoverable authorization outcomes.
  Date/Author: 2026-08-31, project planning.
- Decision: Implement the pending-state consume operation with Redis `GETDEL`.
  Rationale: The repository's ioredis version exposes the command directly, and one server-side command makes the
  first-consumer-wins guarantee explicit without a custom script.
  Date/Author: 2026-09-05, Codex.
- Decision: Look up an existing external identity, resolve active membership, and only then synchronize its email.
  Never create an identity from the browser callback.
  Rationale: A recoverable account rejection must not persist new identity data or update an existing record, while a
  successful login should retain email synchronization.
  Date/Author: 2026-09-05, Codex.
- Decision: Ignore only a malformed cookie fragment and continue parsing the remaining fragments.
  Rationale: A user-controlled percent escape must not escape the callback policy as a `500`, and an unrelated bad
  fragment must not erase a valid login-state cookie.
  Date/Author: 2026-09-05, Codex.
- Decision: Require exactly one configured BFF audience and require a present `azp` claim to equal the BFF client.
  Rationale: No trusted co-audience policy is configured, so accepting an additional audience or another authorized
  party would make the ID-token boundary broader than intended.
  Date/Author: 2026-09-05, Codex.
- Decision: Keep deterministic callback-recovery cases in Bruno and use the dedicated live-Keycloak HTTP suite for
  the successful callback.
  Rationale: A successful callback requires a hosted human login and a database membership. The existing live runner
  owns that disposable fixture lifecycle, while the Bruno collection can prove missing, mismatched, consumed, and
  replayed state without adding a second credential-seeding contract.
  Date/Author: 2026-09-05, Codex.

## Outcomes & Retrospective

The callback is now one-shot at the Redis boundary and predictable at the browser boundary. Recoverable state,
authorization-grant, and account failures use three fixed same-origin redirects; provider-integrity failures remain
generic `502` responses, and unexpected infrastructure or programming errors remain generic `500` responses. Every
callback outcome clears the scoped state cookie and carries the two privacy headers.

Review exposed three useful defenses beyond the initial mechanical change. Malformed cookie percent escapes are
isolated per fragment. Unknown or unauthorized identities cannot be created or updated by a safe account redirect,
and ID tokens cannot introduce an untrusted co-audience or authorized party. No schema, migration, external
dependency, production configuration, or browser code changed.

## Context and Orientation

The BFF session module under `src/libs/modules/bff-session/` owns Authorization Code with PKCE, encrypted Redis
sessions, the pending-login-state store, provider exchange, and `GET /v1/auth/callback`. `frontend/02` establishes
public issuer and private provider routing. `frontend/03` establishes the stable `active_membership_required` account
category that this route reuses without exposing membership detail.

The callback now reads the raw query and applies a non-throwing route-local parser, so missing or malformed provider
fields reach the callback recovery policy despite the application's global validation pipe.

The login-state cookie and Redis record are distinct. Clearing the browser cookie does not atomically consume Redis
state, and deleting Redis state does not remove the cookie. The implementation and tests prove both behaviors.

Before editing the BFF module, implementation must read `src/libs/modules/AGENTS.md`,
`src/libs/modules/README.md`, and `src/libs/modules/bff-session/README.md` and keep that README current.

## Scope and Non-Goals

This pull request changes pending-state consumption, route-local query validation, recoverable failure mapping,
transient-cookie cleanup, source Swagger response annotations, focused tests, documentation, and the nearest BFF
Bruno workflow.

It does not change the current-account DTO or policies from `frontend/03`, provider routing from `frontend/02`,
session encryption, cookie security attributes, CSRF, post-login destination preservation, React, generated client
artifacts, identity schema, roles, registration, or production configuration. `frontend/05` consumes the completed
source annotations; `frontend/08` later renders the error route.

## Plan of Work

Keep the pending-state port's existing `consume(stateId)` operation and replace the Redis adapter's separate `GET` and
`DEL` commands with `GETDEL`. Return the parsed immutable pending record once and no value on every later call. Keep
the in-memory live-test adapter's first-consumer-wins behavior aligned with the Redis contract.

Replace the throwing `BffCallbackQueryDto` path with a raw-query or route-local parser whose output represents either
one nonempty string per field or a typed recoverable failure. It must not throw through the global validation pipe
when `code` or `state` is missing, array-valued, blank, or otherwise malformed. Require valid state first. An absent, malformed,
expired, mismatched, or already consumed state maps to `login_state_invalid`. After atomic state consumption, an
absent or malformed authorization code and a typed OAuth authorization-grant rejection covered by the contract map
to `authorization_code_exchange_failed`. Introduce separate provider-adapter error types: only documented grant
rejection responses such as a valid OAuth `400 invalid_grant` enter that category. Fetch rejection/timeout, `429`,
`5xx`, invalid/non-JSON bodies, `401` client failure, unknown OAuth codes, and a `2xx` response missing required token
fields propagate as infrastructure/configuration errors. Zero or multiple consistent active memberships map to
`active_membership_required`.

Refactor the JOSE ID-token verifier boundary so signature, issuer, audience, nonce, expiry, and claim-shape rejection
raise one framework-free `IdTokenVerificationFailedError` rather than Nest's `UnauthorizedException`. The callback
flow maps that typed provider-integrity failure to a redacted `502` with no safe-error redirect or provider detail;
unexpected programming faults retain the normal redacted `500` path. Add cases for each claim class, bad signature,
nonce mismatch, malformed successful token response, and an injected unexpected verifier fault.

For each recoverable category, expire the transient login-state cookie with the same path, security, and SameSite
attributes used when it was written, then return `302` to
`${APP_BASE_URL}/auth/error?code=<percent-encoded-code>`. Add `Cache-Control: no-store` and
`Referrer-Policy: no-referrer` on callback success, safe redirect, and unexpected-error responses. Construct the URL
with the URL API, allow only the fixed code
enum, and never append provider descriptions, authorization codes, state, exception text, or user identifiers.
Successful handling consumes state once, creates at most one session, clears the transient cookie, and preserves its
existing safe application redirect. Unexpected Redis outages, provider transport failures outside the documented
rejection category, and programming errors retain the existing redacted server-error behavior.

Add deterministic concurrency tests that release two requests against the same state simultaneously and assert one
state value, at most one provider exchange, and at most one session. Add HTTP tests for all missing or malformed query
cases, malformed cookie encoding, expired/mismatched/replayed state, each typed provider rejection/infrastructure
branch, membership failure, success, and unexpected server failure.
Assert status, `Location`, cookie expiry, percent encoding, response redaction, and the absence of query secrets.

Own the route's source Swagger query/redirect/error annotations here. Extend `bruno/bff-sessions` with documented
redirect cases using disposable values and no committed tokens. `frontend/05` will export these annotations without
redefining the operation.

Use the Bruno collection for deterministic login-entry and recovery behavior. Keep the successful callback in the
dedicated live-Keycloak HTTP suite because it owns the required hosted-login user and database-membership fixture.

## Interfaces and Dependencies

`GET /v1/auth/callback` keeps its public path. Recoverable failures become same-origin `302` responses with exactly one
of these safe query values:

    /auth/error?code=login_state_invalid
    /auth/error?code=authorization_code_exchange_failed
    /auth/error?code=active_membership_required

The pending-state store exposes one atomic consume operation. The BFF provider adapter, current-account contract,
identity persistence, and public/back-channel routing remain behind their existing injected interfaces. No new
external service, entity, schema, or browser dependency is introduced.

## Acceptance Criteria

- Two concurrent requests with one pending state perform at most one provider exchange and create at most one
  session; replay receives `login_state_invalid` because state consumption is atomic.
- Missing, blank, repeated, array-valued, or malformed `state` reaches the route policy and redirects safely rather
  than returning the global validation `400`. The same invalid shapes for `code` after valid state consumption use
  `authorization_code_exchange_failed` and cannot be retried with that state.
- Every handled state, provider, or membership failure uses its documented code, clears the transient cookie, and
  includes no provider description, raw query value, exception message, or identity detail.
- Success clears transient state and preserves current session issuance. Unexpected infrastructure or programming
  failures remain observable redacted server errors rather than false user-error redirects.
- Only an explicit OAuth authorization-grant rejection uses `authorization_code_exchange_failed`. Transport,
  throttling, provider/server, client-configuration, parse, malformed-success, signature, issuer, audience, nonce,
  expiry, and claim failures return redacted `5xx` and never place provider text in the URL. Every callback response
  is `no-store` with `no-referrer`.
- Source Swagger annotations, focused concurrency/controller/HTTP tests, live-provider flow, Bruno, documentation,
  architecture checks, and repository validation pass in one pull request.

## Validation

Run the pending-state adapter, authorization flow, identity resolver, controller, cookie parser/options, Swagger,
provider adapter, JOSE verifier, redirect, and two-request concurrency tests, plus the Bruno launcher contract:

    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test -- pending-login-state bff-session-flow bff-session.controller parse-cookie-header cookie-options bff-session.swagger keycloak-oauth-client jose-id-token-verifier external-identity-resolver --runInBand
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp node --test scripts/bruno/run-collection.test.mjs
    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm architecture:check

After confirming the Compose project belongs to this checkout, run the live provider and Bruno flows:

    corepack pnpm test:bff-live
    corepack pnpm bruno:bff-sessions
    TMPDIR=/tmp TEMP=/tmp TMP=/tmp corepack pnpm test:ci
    corepack pnpm build
    corepack pnpm docs:lint -- src/libs/modules/bff-session/README.md src/libs/modules/identity/README.md bruno/bff-sessions/README.md .agents/plans/frontend/04-harden-authorization-callbacks.md
    git diff --check

Record exact concurrency counts, HTTP statuses, redirect hosts/codes, cookie/header assertions, nonzero live-test
count, skipped external gates, and Bruno results. Sequential replay alone does not prove the concurrency acceptance
criterion.

## Idempotence and Recovery

Atomic pending-state consumption is intentionally one-shot. After one request consumes state, neither retry nor a
concurrent replay can recover it; the user must begin a new login. Safe error redirects do not create sessions or
identity records.

If a live test fails, retain redacted logs and clean only sessions and fixtures owned by this checkout. Do not delete
shared Keycloak, Redis, or database state. No migration, backfill, or production recovery step is introduced.

## Artifacts and Notes

The delivered callback matrix is:

| Outcome | HTTP result |
| --- | --- |
| Missing, malformed, mismatched, expired, or replayed state | `302 /auth/error?code=login_state_invalid` |
| Missing or malformed code, or explicit authorization-grant rejection | `302 /auth/error?code=authorization_code_exchange_failed` |
| Missing or non-unique active membership | `302 /auth/error?code=active_membership_required` |
| ID-token integrity or claim rejection | Redacted `502` without `Location` |
| Unexpected provider, infrastructure, or programming failure | Redacted `500` without `Location` |
| Successful callback | `302` to `APP_BASE_URL` with session and CSRF cookies |

Every row clears the transient state cookie and uses `Cache-Control: no-store` plus
`Referrer-Policy: no-referrer`. The deterministic two-request test records two consume attempts, one fulfilled
callback, one `LoginStateInvalidError`, and exactly one provider exchange, verifier call, identity lookup,
membership lookup, email synchronization, and session creation.

Validation on 2026-09-05 produced these nonsecret results:

- Focused Jest selection: 10 suites and 141 tests passed; the separately gated live suite was selected but skipped
  four tests until the dedicated runner supplied its environment.
- Bruno launcher contract: seven Node tests passed. The real Compose collection then passed eight requests and nine
  assertions with Bruno 4.1.0 and no skipped requests.
- Dedicated live Keycloak runner: four tests passed with zero skipped across public issuer and internal token,
  refresh, logout, and JWKS routes.
- Full `test:ci`: 193 Jest suites and 1,765 tests passed; 10 suites and 63 tests with unrelated external gates skipped.
  All 15 runner tests then passed.
- Type checking, the 604-file build, the module architecture gate (nine modules and 108 baselined violations), and
  `git diff --check` passed. ESLint passed with one preexisting warning in
  `src/libs/config/src/load-secrets.spec.ts`.
- Harper passed the four changed Markdown files with the exact command in Validation.

No provider query values, authorization codes, state values, cookies, CSRF values, tokens, Redis values, passwords,
or real user data were retained in these artifacts. The uniquely named `lef499` Compose containers, network, and
volumes used for live validation were removed afterward.

The atomic state boundary, route-local validation, redirect taxonomy, cookie cleanup, unexpected-error behavior,
validation, and one-pull-request scope are decision-complete.

## Plan readiness

Ready to implement.
