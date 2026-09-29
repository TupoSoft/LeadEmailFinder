# Reject Incorrect Secrets When the MCP Token Cache Is Warm

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The MCP connector must authenticate the complete credential presented on each request. After this change,
knowing a customer's client ID is insufficient to borrow that customer's cached bearer token. A developer can
observe the fix by authenticating once with a valid ID and secret, then submitting the same ID with an incorrect
secret: the second request receives HTTP `401`, and no tool handler runs. Repeating the valid credential still
reuses its unexpired token.

This plan delivers one implementation PR, with the proposed conventional title
`fix(mcp): bind cached tokens to complete credentials`. It corrects the cache contract proposed by
`mcp-connector/02`. PR #705 now implements that unsafe contract, so this existing plan also owns the first
finding from its review. Keep the stable plan key and its synced issue instead of creating a duplicate task.

## Progress

- [x] (2026-09-18) Rebuilt `TokenCache` to identify entries by an HMAC-SHA-256 digest over the complete
      `(clientId, clientSecret)` pair, with independent pending-grant promises per digest.
- [x] (2026-09-18) Extended `token-cache.spec.ts`, added `auth-http.integration.spec.ts` and
      `bruno/mcp-authentication/`, and updated the original plan 02 and road map README's superseded cache
      guidance and Bruno exemption.
- [x] (2026-09-18) Validated HTTP behavior, secret handling, concurrency, and documentation changes; ran the
      collection live against a real dev-stack Keycloak. Recorded results below.

## Plan dependencies

- `mcp-connector/02`
- `mcp-connector-hardening/04`

## Surprises & Discoveries

Review evidence from 2026-09-18 confirms the planned defect at PR #705 head
`dffe34cc66085c042343cc5c7aaa75547aeb925f`. A local fake token endpoint and the real connector returned
HTTP `200` and `pong` for a valid secret, a wrong secret, and an empty secret under the same client ID.
Only one token grant occurred. These are local HTTP results, not live Keycloak validation.

Two calls made while the first grant was pending also started two grants.
The existing concurrent test in `main.spec.ts` resolves its mock immediately and does not prove shared pending work.
The package tests passed 68 of 68 cases despite both gaps. Implementation has not started.

**Implementation evidence, 2026-09-18:**

- Reproduced the pre-fix defect directly rather than only trusting the review write-up: temporarily restored the
  original `clientId`-only `TokenCache` and reran the new isolation/concurrency tests against it — three failed
  exactly as expected (a wrong or empty secret after a valid login still resolved to the cached token; the
  concurrency test failed for a different, also-expected reason, since the old design deduplicated nothing).
  Restoring the fixed implementation returned all tests to green. This confirms the new tests are genuine
  regression coverage, not tests that would pass against either design.
- Live-verified the fix end to end against the real dev-stack Keycloak using the seeded `lef-svc-dev-fixture`
  credential and the new `bruno/mcp-authentication/` collection: a wrong secret for that same client ID, which
  PR #705's live validation had shown succeeding with `200`/`pong`, now correctly receives `401` after this fix,
  while the valid credential still succeeds before and after that rejection.
- Mocking `global.fetch` for the token endpoint in `auth-http.integration.spec.ts` required discriminating by
  request URL and forwarding anything else to the real `fetch`, and restoring it in `afterEach` — the same
  pattern already established in `main.spec.ts`'s and `request-origin.integration.spec.ts`'s auth/origin
  integration tests, because the MCP SDK's own `StreamableHTTPClientTransport` also uses the global `fetch` to
  reach the server under test.
- `ping` carries no signal that would let a test observe *which* bearer token a given request's handler received,
  so `auth-http.integration.spec.ts` mocks `create-server.js` to swap in a small `echo-token` tool (returning
  `extra.authInfo?.token`) instead of reusing the real `ping` — this is the only way to prove concurrent clients
  never observe each other's bearer through the real SDK path rather than only at the `TokenCache` unit level.

## Decision Log

- Decision: Reuse plan 01 for the confirmed PR #705 bypass. Date/Author: 2026-09-18, Codex.
  This preserves the synced issue and existing security prerequisite without duplicating implementation work.

- Decision: Identify cache entries using an HMAC-SHA-256 digest over the UTF-8 representation of
  `JSON.stringify([clientId, clientSecret])`. Generate a random 32-byte HMAC key once when the process's singleton
  cache is constructed. Rationale: the tuple encoding is unambiguous, and the process-specific key avoids keeping
  raw secrets or reusable secret fingerprints derived without a key in cache keys. Date/Author: 2026-09-16,
  Codex planning.
- Decision: Use the same digest for completed entries and concurrent pending grants. Rationale: requests with an
  identical credential can share one token grant, while a different secret must never share its promise or token.
  Date/Author: 2026-09-16, Codex planning.
- Decision: Preserve access-token expiry and revocation semantics already owned by Keycloak and the API.
  Rationale: this change prevents an incorrect secret from borrowing another credential's token; it does not add
  token introspection or promise immediate invalidation of a previously valid credential's cached token after
  secret rotation. Date/Author: 2026-09-16, Codex planning.
- Decision: Add a small Bruno collection for the MCP authentication exchange. Rationale: the corrected `401`
  behavior is externally observable HTTP authentication behavior under root `AGENTS.md`; the original road map's
  blanket Bruno exemption does not override that policy. Date/Author: 2026-09-16, Codex planning.

## Outcomes & Retrospective

Delivered exactly the scope this plan described: `TokenCache` now identifies entries by an HMAC-SHA-256 digest
over the complete `(clientId, clientSecret)` pair (a process-local key, never derived from or reversible to the
credentials), with independent pending-grant promises per digest so concurrent identical credentials share one
grant while different secrets for the same `clientId` never do. The public `getAccessToken` shape and constructor
order are unchanged, so `main.ts`'s auth gate needed no edits. Added the required unit, HTTP-integration, and
Bruno coverage, and corrected the superseded `clientId`-only cache guidance and blanket Bruno exemption in the
original `mcp-connector/02` plan and road map README. Live validation against a real dev-stack Keycloak confirms
the fix; no business-module, database, or API change was needed.

## Context and Orientation

All paths are repository-relative. This update was authored on master commit
`e8b7d77688302ea8de9c15bc97f1af8cbb638326` using the exact PR #705 head recorded above.
At that master base the scaffold exists, but the authentication files are still in the open PR.
Begin implementation from a base containing `mcp-connector/02`; recheck its source if the head changes.

The delivered design in PR #705 parses Basic credentials in `apps/mcp-server/src/auth/basic-credentials.ts`.
`main.ts` checks origin and method before exchanging credentials through an injected `AccessTokenProvider`.
`TokenCache.getAccessToken` in `apps/mcp-server/src/auth/token-cache.ts` returns an unexpired entry using only
`clientId`, without checking the submitted secret. That admits an incorrect or empty secret after a valid login.
Each request receives a fresh server and transport; the singleton cache is shared across requests.
The resulting bearer is stored in `req.auth` and reaches handlers through the SDK field `authInfo`.
Only `ping` exists at the reviewed head. Future API calls cannot detect that their bearer came from a wrong secret.

Existing evidence is `scripts/proxy-fleet-swarm/m2m-token-provider.ts`: its
`OidcClientCredentialsTokenProvider` owns one fixed credential, exchanges the `client_credentials` grant, and
caches a token until its effective expiry. Its spec uses a fake clock and mocked `global.fetch`. That fixed
credential cache is not vulnerable to this particular substitution because callers cannot supply another secret
to `getToken()`. Reuse its expiry and grant-test conventions, but leave this existing script unchanged.

The API's actual bearer authenticator is
`src/libs/modules/auth/src/application/oidc-credential-authenticator.ts`, which resolves the organization and
permissions from the verified token and active service credential. No business-module code changes are needed.
Root `AGENTS.md`, `.agents/PLANS.md`, and the existing root Jest, lint, and typecheck commands govern this work.

## Scope and Non-Goals

Change the connector's token-cache identity, pending-grant isolation, and focused authentication tests. Preserve
the Basic header format, per-request token context, public `/health`, and existing valid-customer behavior.
Update the conflicting cache decisions and examples in original plan 02 and its road map in the same PR so later
plans cannot reintroduce an ID-only cache. Add the narrow HTTP contract collection described below.

This PR adds no verification tool, billing policy, OAuth discovery flow, Desktop bridge, deployment service,
database change, TypeORM migration, Keycloak migration, or new external dependency. It does not change the API's
authentication module or the existing proxy-fleet token provider. Immediate secret-rotation invalidation and
general cache-capacity policy are separate concerns.
Repairing the existing origin collection belongs to `mcp-connector-hardening/05`.
The startup documentation repair belongs to `mcp-connector-hardening/06`.
This plan remains the required security prerequisite for `mcp-connector/03` and later business tools.

## Plan of Work

First inspect the implementation delivered by `mcp-connector/02`, especially
`apps/mcp-server/src/auth/token-cache.ts`, its spec, and the authentication gate in
`apps/mcp-server/src/main.ts`. Keep the constructor inputs `tokenEndpointBaseUrl`, `clockSkewSeconds`, and `now` in their existing order. Add private process-local
HMAC key material generated with `randomBytes(32)` from `node:crypto`, and a small private digest operation using
`createHmac('sha256', key)`. Hash the JSON tuple immediately for each call. Never index an entry by the client ID
alone, concatenate ID and secret without an unambiguous encoding, or use the Basic header itself as a cache key.

Store successful entries as digest to `{token, expiresAtMs}`. Only return the matching entry while its effective
expiry remains in the future. Apply the existing clock-skew margin exactly once. Delete an expired matching entry
before a new grant attempt, and never return an expired token if renewal fails. Do not alter another digest's
entry when a grant is rejected. A newly presented secret for an existing ID must take its own grant path; it may
populate an entry only after that grant succeeds.

If the matching digest has a grant already in progress, await that promise. Otherwise, start one grant and store
only its promise under that digest in a separate pending map. Remove the pending entry in `finally` on success
or failure. A rejected promise must not become a reusable negative cache entry: a later attempt must reach the
token endpoint again. Different secrets for one ID, and credentials for different IDs, must have independent
pending grants. Do not put credentials into an instance field, completed entry, or pending-map value. The active
request and grant operation can hold their transient inputs until completion; JavaScript cannot guarantee secure
erasure of those strings, so document bounded retention rather than claiming memory was zeroed.

Keep HMAC keys, digests, raw secrets, Basic headers, and bearer tokens out of logs, returned errors, and tool
results. Preserve the prerequisite's sanitized grant errors. In the HTTP gate, a rejected credential must map to
the existing generic `401` response before transport or tool dispatch. Preserve existing handling of token
endpoint outages; never reinterpret an outage as permission to use a token from a different or expired entry.
Keep bearer state in the SDK's per-request context rather than a mutable field shared by requests.

Extend `apps/mcp-server/src/auth/token-cache.spec.ts` with table-driven credential-isolation cases, the valid-then-
incorrect-secret and empty-secret regressions, fake-clock expiry and failed-renewal cases, retry after failed grant, and deferred
fetch responses that prove the concurrent cases. Cover IDs and secrets whose plain concatenations would be equal
so that an ambiguous replacement of the tuple encoding would fail. Check that returned errors and captured logs
contain none of the fixture's secret or token values. Restore mocks after each test.

Add `apps/mcp-server/src/auth/auth-http.integration.spec.ts`. Reuse the prerequisite's server factory, a local
fake token endpoint, and the real SDK transport on an ephemeral port. Initialize a client with valid credentials
and call `ping`, then send valid MCP requests with the same ID and either an incorrect or empty secret.
Use the existing stateless transport and do not introduce sessions.
Assert HTTP `401` and unchanged transport/tool dispatch counts for the rejected requests. Repeat with the correct credential and assert success with no extra valid-credential grant. Also cover
an incorrect request while the valid grant is pending, and concurrent valid clients whose handlers observe only
their own request's bearer. Close servers and clients in `finally`; no Compose stack is needed for these tests.

Add `bruno/mcp-authentication/` as a distinct MCP initialization workflow, following the YAML format of
`bruno/m2m-oidc-authentication/`. Include `opencollection.yml`, `environments/local.yml`, a short `README.md`, and
ordered requests `01-valid-initialize.yml`, `02-wrong-secret-rejected.yml`, `03-missing-credential-rejected.yml`,
`04-empty-secret-rejected.yml`, and `05-valid-initialize-again.yml`.
Read the connector URL, client ID, and secret from process environment variables `MCP_AUTH_BASE_URL`, `MCP_AUTH_CLIENT_ID`, and `MCP_AUTH_CLIENT_SECRET`; commit no real credential.
Derive an incorrect secret in memory by appending a suffix to the valid one. Both valid requests initialize the
real connector using the SDK protocol version delivered by the prerequisite, with the transport's required
headers, and assert a successful initialization response. Allow the transport's documented JSON or finite SSE
response framing. Rejection requests assert `401` and the generic error shape.
The current stateless transport creates no sessions, so no session deletion is needed.
Do not print headers, variables, or exported response reports containing credentials. The SDK integration test separately proves that handlers were not dispatched.

Finally update the cache decision, work instructions, tests, and acceptance criteria in
`.agents/plans/mcp-connector/02-bridge-oidc-client-credentials.md` and the shared cache constraint in
`.agents/plans/mcp-connector/README.md` to reference this credential binding. Replace the road map's blanket Bruno
exemption with the root policy and the scoped collection. Record the implementation and actual validation in this
living plan without marking the prerequisite's unrelated work complete.

## Interfaces and Dependencies

`TokenCache.getAccessToken({clientId, clientSecret}): Promise<string>` retains its public shape. Cache identity
and pending-grant storage remain private implementation details. `node:crypto` supplies the only additional
library API; it requires no package, environment variable, persisted key, or deployment secret. Process restart
creates a new HMAC key and empty maps.

The visible correction is HTTP `401` for a rejected secret even after that client ID has authenticated
successfully. Valid credentials, missing/malformed credential rejection, MCP session behavior, and the public
health endpoint keep their existing contracts. The prerequisite supplies the runnable package, HTTP gate, SDK,
and root validation integration. This plan can be validated using `ping` before any real business tool exists.

## Acceptance Criteria

- A valid credential warms the cache; incorrect and empty secrets for the same ID are sent to the token endpoint
  and rejected. Those requests receive no cached token, HTTP `401` is returned, and no transport/tool dispatch occurs.
- Repeating the identical valid credential before expiry uses one completed grant. Distinct credentials never
  receive each other's token, including input pairs that would collide under plain concatenation.
- Concurrent requests with identical credentials share one grant. Concurrent requests with different secrets
  never share a pending promise, and each authenticated handler receives only its own request's bearer.
- At the effective expiry boundary, the old token is not reused. Failed renewal rejects, removes pending state,
  and permits a later retry to make a fresh grant. A failure for one digest leaves other valid entries usable.
- Cache keys and values contain no raw client secret or Basic header; completed values contain only token and
  expiry. Captured logs and public errors contain no fixture secret, bearer token, HMAC key, or digest.
- HTTP integration tests and all five Bruno requests pass with correct success/rejection outcomes. Missing
  credentials and malformed Basic headers still trigger zero token grants in the integration test, and `/health` remains public.
- Focused tests, package typecheck, root typecheck/lint, and prose validation pass. No schema, provider, business
  permission, or billing behavior changes.

## Validation

Run these commands from the repository root after implementing the prerequisite and this change:

```sh
corepack pnpm exec jest --runInBand apps/mcp-server/src/auth/token-cache.spec.ts apps/mcp-server/src/auth/auth-http.integration.spec.ts
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server exec tsc --noEmit -p tsconfig.json
corepack pnpm typecheck
corepack pnpm lint
```

The first command exercises unit behavior and real local HTTP/SDK integration using a fake token endpoint. It is
not live Keycloak evidence. For Bruno, run the connector from prerequisite 02 against the local development
Keycloak instance. Build the package, set `OIDC_BACKCHANNEL_URL` to the reachable realm URL, and start it.
Use `MCP_ALLOWED_ORIGINS=https://client.example` if the client sends that origin.
Load `MCP_AUTH_BASE_URL`, `MCP_AUTH_CLIENT_ID`, and `MCP_AUTH_CLIENT_SECRET` without printing credentials.
The customer summary in `.dev/keycloak/customer-fixture.json` contains no secret.
Reuse `loadDevelopmentStack` from `scripts/testing/development-stack.mjs` with `persistMetadata: false`.
Check the summary issuer against that stack and require client ID `lef-svc-dev-fixture`.
Then use `customerClientSecret` from `scripts/bruno/async-verification-fixture.mjs` to read its current secret.
In that same Node process, call `spawn('corepack', ['pnpm', 'exec', 'bru', 'run', '--env', 'local'], options)`.
Set `options.cwd` to `resolve('bruno/mcp-authentication')` and use `stdio: 'inherit'`.
Pass the parent environment plus all three `MCP_AUTH_*` values through `options.env`.
Await the child exit and propagate failures; never place the secret in command arguments or logs.
Include this complete retrieval and execution snippet in the new collection README.
Do not assume that a child process can export credentials to a later shell.

This standalone collection does not use the API-specific runner registry in `scripts/bruno/run-collection.mjs`.
Inspect its five executed results; discovery without execution is not a pass. If the local connector or Keycloak
is unavailable, validate the collection's YAML and report Bruno execution as unverified. Container deployment is
not a prerequisite, and no production validation is claimed.

From the repository root, validate all Markdown changed by the implementation PR:

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector-hardening/01-bind-token-cache-to-credentials.md .agents/plans/mcp-connector/02-bridge-oidc-client-credentials.md .agents/plans/mcp-connector/README.md bruno/mcp-authentication/README.md
```

During planning, the new tests and collection remain proposed artifacts. Run its focused prose command separately:

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector-hardening/01-bind-token-cache-to-credentials.md
```

## Idempotence and Recovery

Repeating authenticated calls is safe and preserves the existing token-cache lifetime. Restarting the connector
discards the HMAC key, cached tokens, and pending state; the next valid call performs a new grant. The focused tests
use disposable servers and no database. Bruno initializes the stateless connector without creating product data. No reset, reseed, or migration is needed for this change. If an existing local
development stack needs recovery, use its established procedure rather than adding another one here.

## Artifacts and Notes

The unsafe contract is visible in the `Map<clientId, {token, expiresAtMs}>` decision of original plan 02 and its
`getAccessToken` instructions. The existing script's fixed constructor credential explains why copying its cache
shape into a shared HTTP service needs an explicit credential identity. This document specifies one narrow fix
and preserves the distinction between existing repository code and proposed connector files.

The 2026-09-18 review also found 29 Harper diagnostics in the updated original authentication plan.
When this implementation revises that document, fix actionable findings and require the focused prose check to pass.
Do not classify a failing check as passed because some diagnostics existed before this change.

Before implementation, follow root `AGENTS.md` for assigning the synced issue and moving it to In Progress. At
delivery, link that issue with `Closes` in the single implementation PR, report Bruno's actual result, and record
the exact Harper command and result. Creating this plan alone implements no runtime behavior.

## Plan readiness

Ready to implement
