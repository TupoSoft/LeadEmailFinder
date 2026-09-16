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
`mcp-connector/02`; it does not implement the original connector scaffold ahead of that prerequisite.

## Progress

- [ ] (2026-09-16) Implement credential-bound token caching and focused rejection coverage after the prerequisite.
- [ ] (2026-09-16) Validate HTTP behavior, secret handling, concurrency, and the documentation changes.

## Plan dependencies

- `mcp-connector/02`
- `mcp-connector-hardening/04`

## Surprises & Discoveries

None yet.

## Decision Log

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

Not started.

## Context and Orientation

All paths are repository-relative. At planning baseline `e4c1062`, `.agents/plans/mcp-connector/02-bridge-oidc-client-credentials.md`
is a plan, and `apps/mcp-server` has not been implemented. The application paths below are proposed by that
prerequisite, except for the new integration spec and Bruno collection explicitly named here. Inspect the
prerequisite's delivered files before editing and record any path changes in this document.

The proposed connector receives HTTP Basic credentials, exchanges them at the Keycloak token endpoint, and passes
the resulting bearer token to the MCP request context. Original plan 02 proposes
`apps/mcp-server/src/auth/token-cache.ts` with `getAccessToken({clientId, clientSecret}): Promise<string>` and a
cache indexed only by `clientId`. Returning a cached token before checking the supplied secret authenticates an
incorrect secret whenever that ID has a live entry. The downstream API receives a valid bearer token and cannot
recover the fact that the connector accepted the wrong secret.

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

## Plan of Work

First inspect the implementation delivered by `mcp-connector/02`, especially
`apps/mcp-server/src/auth/token-cache.ts`, its spec, and the authentication gate in
`apps/mcp-server/src/main.ts`. Keep the current constructor's endpoint and clock inputs. Add private process-local
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
incorrect-secret regression, fake-clock expiry and failed-renewal cases, retry after failed grant, and deferred
fetch responses that prove the concurrent cases. Cover IDs and secrets whose plain concatenations would be equal
so that an ambiguous replacement of the tuple encoding would fail. Check that returned errors and captured logs
contain none of the fixture's secret or token values. Restore mocks after each test.

Add `apps/mcp-server/src/auth/auth-http.integration.spec.ts`. Reuse the prerequisite's server factory, a local
fake token endpoint, and the real SDK transport on an ephemeral port. Initialize a client with valid credentials
and call `ping`, then send a valid MCP request with the same ID, an incorrect secret, and the established session
ID if the transport uses sessions. Assert HTTP `401` and unchanged transport/tool dispatch counts for the rejected
request. Repeat with the correct credential and assert success with no extra valid-credential grant. Also cover
an incorrect request while the valid grant is pending, and concurrent valid clients whose handlers observe only
their own request's bearer. Close servers and clients in `finally`; no Compose stack is needed for these tests.

Add `bruno/mcp-authentication/` as a distinct MCP initialization workflow, following the YAML format of
`bruno/m2m-oidc-authentication/`. Include `opencollection.yml`, `environments/local.yml`, a short `README.md`, and
ordered requests `01-valid-initialize.yml`, `02-wrong-secret-rejected.yml`, `03-missing-credential-rejected.yml`,
and `04-valid-initialize-again.yml`. Read the connector URL, client ID, and secret from process environment
variables `MCP_AUTH_BASE_URL`, `MCP_AUTH_CLIENT_ID`, and `MCP_AUTH_CLIENT_SECRET`; commit no real credential.
Derive an incorrect secret in memory by appending a suffix to the valid one. Both valid requests initialize the
real connector using the SDK protocol version delivered by the prerequisite, with the transport's required
headers, and assert a successful initialization response. Allow the transport's documented JSON or finite SSE
response framing. Rejection requests assert `401` and the generic error shape. Delete sessions created by the
collection when the transport supports session deletion. Do not print headers, variables, or exported response
reports containing credentials. The SDK integration test separately proves that handlers were not dispatched.

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

- A valid credential warms the cache; an incorrect secret for the same ID is sent to the token endpoint and
  rejected. It receives no cached token, HTTP `401` is returned, and no transport/tool dispatch occurs.
- Repeating the identical valid credential before expiry uses one completed grant. Distinct credentials never
  receive each other's token, including input pairs that would collide under plain concatenation.
- Concurrent requests with identical credentials share one grant. Concurrent requests with different secrets
  never share a pending promise, and each authenticated handler receives only its own request's bearer.
- At the effective expiry boundary, the old token is not reused. Failed renewal rejects, removes pending state,
  and permits a later retry to make a fresh grant. A failure for one digest leaves other valid entries usable.
- Cache keys and values contain no raw client secret or Basic header; completed values contain only token and
  expiry. Captured logs and public errors contain no fixture secret, bearer token, HMAC key, or digest.
- HTTP integration tests and all four Bruno requests pass with correct success/rejection outcomes. Missing
  credentials still trigger zero token grants in the integration test, and `/health` remains public.
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
Keycloak instance, using that plan's documented startup command and seeded service-client credential. Load the
three `MCP_AUTH_*` variables into the environment without printing the credential. Then run:

```sh
cd bruno/mcp-authentication
corepack pnpm exec bru run --env local
```

This standalone collection does not use the API-specific runner registry in `scripts/bruno/run-collection.mjs`.
Inspect its four executed results; discovery without execution is not a pass. If the local connector or Keycloak
is unavailable, validate the collection's YAML and report Bruno execution as unverified. Container deployment is
not a prerequisite, and no production validation is claimed.

From the repository root, validate all Markdown changed by the implementation PR:

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector-hardening/01-bind-token-cache-to-credentials.md .agents/plans/mcp-connector/02-bridge-oidc-client-credentials.md .agents/plans/mcp-connector/README.md bruno/mcp-authentication/README.md
```

During planning, only this document exists among the new artifacts. Run its focused prose command separately:

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector-hardening/01-bind-token-cache-to-credentials.md
```

## Idempotence and Recovery

Repeating authenticated calls is safe and preserves the existing token-cache lifetime. Restarting the connector
discards the HMAC key, cached tokens, and pending state; the next valid call performs a new grant. The focused tests
use disposable servers and no database. Bruno initializes sessions without creating product data and closes
those sessions when supported. No reset, reseed, or migration is needed for this change. If an existing local
development stack needs recovery, use its established procedure rather than adding another one here.

## Artifacts and Notes

The unsafe contract is visible in the `Map<clientId, {token, expiresAtMs}>` decision of original plan 02 and its
`getAccessToken` instructions. The existing script's fixed constructor credential explains why copying its cache
shape into a shared HTTP service needs an explicit credential identity. This document specifies one narrow fix
and preserves the distinction between existing repository code and proposed connector files.

Before implementation, follow root `AGENTS.md` for assigning the synced issue and moving it to In Progress. At
delivery, link that issue with `Closes` in the single implementation PR, report Bruno's actual result, and record
the exact Harper command and result. Creating this plan alone implements no runtime behavior.

## Plan readiness

Ready to implement
