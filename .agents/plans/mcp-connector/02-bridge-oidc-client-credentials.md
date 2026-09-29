# Bridge OIDC Client-Credentials Auth into the MCP Connector

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

After this plan, the MCP connector scaffolded in `mcp-connector/01` requires every request to carry a customer's
own service-client credential and rejects anything else before any tool can run. A developer can observe this by
calling the connector with no `Authorization` header (or a malformed one) and getting a clean, immediate
rejection with zero calls to Keycloak, and by calling it twice in quick succession with a real credential and
observing (via a fake token endpoint in tests, or request logging in manual verification) exactly one token-mint
call — the second request reuses the cached token. This plan does not yet call the real LeadEmailFinder API; it
only proves the credential-to-bearer-token bridge in isolation, keeping `ping` (from plan 01) as the one tool that
now requires auth to reach.

## Progress

- [x] (2026-09-18) Added `apps/mcp-server/src/auth/{basic-credentials,token-cache}.ts` and their specs.
- [x] (2026-09-18) Gated every `/mcp` request in `main.ts` (after origin/method checks, before transport
      dispatch) and threaded the minted access token into `RequestHandlerExtra.authInfo` via `req.auth`.
- [x] (2026-09-18) Updated every existing spec that exercises `/mcp` to supply a credential, ran the full
      suite, and validated live against a real dev-stack Keycloak. Recorded results below.

## Plan dependencies

- `mcp-connector/01`

## Surprises & Discoveries

- `StreamableHTTPServerTransport.handleRequest` already accepts `req: IncomingMessage & { auth?: AuthInfo }` and
  threads that `AuthInfo` straight into `RequestHandlerExtra.authInfo` for every tool callback — this is exactly
  the "SDK's per-request context mechanism" the plan asked to confirm rather than invent, and needed no
  workaround: setting `(req as IncomingMessage & { auth?: AuthInfo }).auth = {...}` immediately before
  `transport.handleRequest(req, res)` was sufficient.
- Making every existing `/mcp` request require auth broke every previously-passing spec that called `ping` or
  `tools/list` without a credential (`create-server.spec.ts`, `main.spec.ts`'s routing and crash-regression
  tests, `request-origin.integration.spec.ts`). Each now supplies a fake, always-succeeding `AccessTokenProvider`
  (or a real `TokenCache` with mocked `global.fetch`, for the tests specifically about the auth gate) and a
  valid-shaped `Authorization` header; this was expected scope, not a regression, but touched four existing
  files.
- Mocking `global.fetch` for `TokenCache`'s grant call is not safe to do wholesale in an in-process HTTP test:
  the MCP SDK's own `StreamableHTTPClientTransport` also uses the global `fetch` to reach the server under test,
  so a blanket mock breaks the client's own requests too. The working pattern is a mock that forwards to the
  real `fetch` for any URL other than the token endpoint, and restores the real `fetch` in `afterEach` so it
  cannot leak into later `describe` blocks in the same file — an unguarded leak initially broke the unrelated
  crash-regression tests later in `main.spec.ts` because Jest runs all `describe` blocks in one file inside the
  same JS realm.
- Live-verified the exact secret-bypass gap `mcp-connector-hardening/01` exists to fix, by accident during manual
  validation: after one successful call with `lef-svc-dev-fixture`'s real secret, a second call presenting the
  *same* `clientId` with a deliberately wrong secret still received `200` and a real tool result, because the
  cache (correctly, per this plan's own design) is keyed by `clientId` alone and returned the still-valid cached
  token without ever re-checking the secret. A fresh process with no prior successful call for that `clientId`
  correctly rejected the same wrong secret with `401`. This is the literal vulnerability
  `mcp-connector-hardening/01` targets, reproduced live rather than only reasoned about.
- A leftover `node dist/main.js` process from an earlier, unrelated manual validation (a `pnpm --filter ...
  start` process whose `kill $PID` had only killed the pnpm wrapper, not the reparented `node` child) was still
  bound to port 3002 and briefly caused a live-verification run to hit the wrong, pre-auth server build. Killing
  it by PID (found via `lsof -i :3002`) and rerunning confirmed the real, current build's behavior.
- `@modelcontextprotocol/inspector@2.7.0 --cli` does not surface a raw `401` from the server as a plain error;
  it treats any `401` as an invitation to attempt its own interactive OAuth discovery flow, failing instead with
  a generic `auth_required` error whose message mentions needing a TTY. This is the Inspector CLI's own
  client-side behavior, not a server defect -- a direct `curl` against the same running process confirms the
  real, raw response is exactly `401 {"error":"authentication_required"}` as intended. "Fails cleanly with 401"
  in this plan's acceptance criteria is verified at the HTTP level, not through the Inspector CLI's own output.

## Decision Log

- Decision: Customers present their service-client `clientId`/`clientSecret` as HTTP Basic auth
  (`Authorization: Basic base64(clientId:clientSecret)`) on the connection to the MCP server, not a custom header
  pair. Rationale: this maps 1:1 onto the OAuth2 client-credentials pair a customer already holds from
  `service-client-management`, needs no new header convention, and is natively supported as a static configured
  header by `@modelcontextprotocol/inspector` and typical MCP HTTP client configurations. Date/Author: 2026-09-16,
  Codex planning.
- Decision: The connector mints and caches short-lived bearer tokens on the customer's behalf rather than asking
  the customer to paste an already-minted JWT into their MCP client configuration. Rationale: the underlying API's
  client-credentials-minted JWTs are short-lived (Keycloak's typical access-token lifetime is on the order of
  minutes), and MCP client configuration (a static header) is normally set once, not refreshed per session —
  requiring a fresh JWT every few minutes would make the connector unusable. Minting internally from a long-lived
  `clientId`/`clientSecret` pair matches how every other programmatic caller of this API already works (Bruno
  fixtures, browser-live test scripts) and is the standard shape of an OAuth2 client-credentials integration.
  Date/Author: 2026-09-16, Codex planning.
- Decision: Generalize `scripts/proxy-fleet-swarm/m2m-token-provider.ts`'s `OidcClientCredentialsTokenProvider`
  into a `Map<clientId, {token, expiresAtMs}>`-keyed cache rather than writing a new token-minting implementation
  from scratch. Rationale: that provider already implements exactly this grant type and caching discipline
  (POSTs `{issuer}/protocol/openid-connect/token`, caches with a clock-skew margin derived from `expires_in`); its
  own spec (`m2m-token-provider.spec.ts`, mocking `global.fetch`) is the concrete unit-test convention this plan's
  tests mirror. Date/Author: 2026-09-16, Codex planning.
  **Superseded 2026-09-18 by `mcp-connector-hardening/01`**: keying the cache by `clientId` alone let a request
  presenting an incorrect or empty secret reuse another request's already-cached token for the same `clientId` —
  confirmed both in review and in this plan's own live validation (see Surprises & Discoveries above). The shipped
  cache in `apps/mcp-server/src/auth/token-cache.ts` is keyed by an HMAC-SHA-256 digest over the complete
  `(clientId, clientSecret)` pair instead; every "keyed by `clientId`" reference elsewhere in this document
  (Plan of Work, Interfaces and Dependencies, Acceptance Criteria) describes the original, since-corrected design
  and should be read together with that plan.
- Decision: The cache stores only the minted token and its expiry, never the client secret. Rationale: minimizing
  how long and how widely a customer's secret is held in memory is a direct security property this plan must
  preserve, matching this repository's existing discipline of never retaining or logging credential material
  longer than a single use requires. Date/Author: 2026-09-16, Codex planning.
- Decision: Read the token endpoint base URL from `OIDC_BACKCHANNEL_URL` with no fallback, and stop the process
  before it opens a listener if it is unset. Rationale: `OIDC_BACKCHANNEL_URL` is already the established
  convention for "the URL this process itself uses to reach Keycloak" (`docker/compose.yaml`'s `api` service,
  `scripts/keycloak/smoke-test.ts`), and unlike `bff-session`'s optional fallback to `OIDC_ISSUER_URL`, this
  connector has no other preexisting URL to fall back to. Since every authenticated request depends on it,
  failing fast at startup (mirroring `mcp-transport-hardening/02`'s `MCP_ALLOWED_ORIGINS` validation) is safer
  than letting every request fail later with a confusing runtime error. Date/Author: 2026-09-18, implementation.
- Decision: Place the auth gate after the existing method check (405 for non-`POST`), not before it. Rationale:
  `mcp-transport-hardening/01`'s and `/02`'s already-shipped tests assert `GET`/`DELETE /mcp` return `405` with no
  credential; auth only needs to gate the `POST` path that actually reaches transport dispatch, so this ordering
  adds the new requirement without silently changing an already-tested, already-merged contract.
  Date/Author: 2026-09-18, implementation.

## Outcomes & Retrospective

Delivered exactly the scope this plan described: Basic-credential parsing, a `clientId`-keyed token cache
generalized from `m2m-token-provider.ts`, and a request-level auth gate in front of every `/mcp` method (`GET
/health` stays public). `ping` now requires a valid credential end to end, proved both in Jest (mocked grant
calls) and live against a real dev-stack Keycloak with the seeded `lef-svc-dev-fixture` customer credential. The
known `clientId`-only cache-key gap was left exactly as this plan specifies, and live validation reproduced it
directly, confirming why `mcp-connector-hardening/01` is the correct very-next plan rather than a nice-to-have.
**Update (2026-09-18):** `mcp-connector-hardening/01` has since implemented that fix; the cache is credential-bound
in the shipped code even though this document's own Plan of Work still describes the original, superseded design.

## Context and Orientation

All paths below are repository-relative.

`scripts/proxy-fleet-swarm/m2m-token-provider.ts` defines `M2mCredentials` (`{issuer, clientId, clientSecret}`),
`BearerTokenProvider` (`{getToken(): Promise<string>}`), and `OidcClientCredentialsTokenProvider`, which POSTs
`${issuer}/protocol/openid-connect/token` with `grant_type=client_credentials` plus the client id/secret as
form-encoded body fields, caches `{token, expiresAtMs}` keyed by nothing (one credential per instance), and
refreshes when `now >= expiresAtMs`, using `expires_in` from the token response minus a configurable clock-skew
margin (default 30 seconds). Its own spec exercises this against a mocked `global.fetch`.

The real LeadEmailFinder API authenticates exactly these tokens today via `OidcCredentialAuthenticator`
(`src/libs/modules/identity`), checking the bearer JWT against `OIDC_ISSUER_URL`/`OIDC_AUDIENCE`/`OIDC_JWKS_URI`.
Inside the Compose network, the API and Keycloak communicate over an internal backchannel URL (the existing
pattern used by other in-network callers is an `OIDC_BACKCHANNEL_URL`-shaped environment variable, distinct from
the publicly reachable issuer URL) — the connector, running as another Compose service starting in plan 06, mints
tokens against that same internal backchannel, not the public issuer URL, when deployed. For local development
before plan 06 exists, the token endpoint URL is supplied via an environment variable this plan defines.

`apps/mcp-server/src/main.ts` (from plan 01) currently dispatches every request straight to the transport with no
gate. This plan inserts an authentication step before that dispatch.

## Scope and Non-Goals

This plan adds Basic-credential parsing, the keyed token cache, and the request-level auth gate. It does not add
the real API client or any real tool beyond continuing to expose `ping` (now behind auth). It does not add
Docker/Compose wiring (plan 06) or a customer-facing setup guide (plan 07) — local manual verification uses a real
dev-stack Keycloak instance, not the deployed connector.

## Plan of Work

Create `apps/mcp-server/src/auth/basic-credentials.ts` exporting a function that parses an `Authorization` header
value, returning `{clientId, clientSecret}` on a well-formed `Basic <base64(id:secret)>` value, or a typed failure
result otherwise (missing header, wrong scheme, malformed base64, missing colon separator). Keep this function
pure and side-effect-free so it is trivially unit-testable.

Create `apps/mcp-server/src/auth/token-cache.ts` exporting a `TokenCache` class generalizing
`OidcClientCredentialsTokenProvider`: constructor takes the token endpoint base URL and a clock function (for
testability, defaulting to `Date.now`); `getAccessToken({clientId, clientSecret}): Promise<string>` looks up the
cache by `clientId`, returns the cached token if `expiresAtMs` is still in the future (minus the clock-skew
margin), otherwise performs the same `client_credentials` grant POST as the existing provider and stores
`{token, expiresAtMs}` keyed by `clientId` — never storing `clientSecret` in the cache entry. On a failed grant
(non-2xx response or missing `access_token`), throw a typed error carrying only the HTTP status and the token
endpoint's own `error` field (Keycloak's own error code, e.g. `invalid_client`) — never the secret that was sent.

Create `apps/mcp-server/src/auth/token-cache.spec.ts` mirroring `m2m-token-provider.spec.ts`'s `global.fetch`
mocking style: assert a cache hit avoids a second fetch call, assert an expired entry triggers exactly one refetch,
assert a failed grant throws without including the request body/secret in the thrown error's message, and assert
two different `clientId`s never share a cached token.

Edit `apps/mcp-server/src/main.ts` to gate every request before transport dispatch (except `GET /health`, which
remains unauthenticated so container healthchecks need no credential): parse the `Authorization` header with
`basic-credentials.ts`; on failure, respond `401` with a small, generic JSON body (e.g.
`{error: "authentication_required"}`) and do not proceed to the transport or call Keycloak at all; on success,
resolve an access token via the `TokenCache` (constructed once at startup) and make it available to the tool
handlers for this request (the SDK's per-request context mechanism — confirm its exact shape against the pinned
SDK version's types when implementing; do not invent a different mechanism if the SDK already provides one).
Ensure no code path logs the `Authorization` header, the parsed secret, or the minted token — add a request logger
only if it already exists from plan 01 and confirm it excludes headers.

Read the token endpoint's base URL from a new environment variable (e.g. `OIDC_TOKEN_ENDPOINT_URL` or reuse the
existing `OIDC_BACKCHANNEL_URL` convention if it is already defined as a shared environment variable elsewhere in
`docker/compose.yaml` — check before introducing a new one).

## Interfaces and Dependencies

New internal modules `apps/mcp-server/src/auth/{basic-credentials,token-cache}.ts` and their specs. No new
external dependency beyond what plan 01 already added (this plan uses only `fetch`, already global in the Node
versions this repo targets). Depends on `mcp-connector/01`'s scaffold. Every later plan that adds a real tool
depends on this plan's access-token availability per request.

## Acceptance Criteria

- A request with no `Authorization` header receives `401` and triggers zero HTTP calls to the token endpoint.
- A request with a malformed Basic value (not base64, missing colon, wrong scheme) receives `401` with the same
  generic body shape, not a stacktrace or an echo of the malformed input.
- Two requests in quick succession with the same valid credential result in exactly one token-mint call (cache
  hit on the second).
- A request whose credential fails the grant (invalid client/secret) receives a clean rejection; a unit test
  asserts the thrown/returned error text never contains the literal secret used in the test.
- `ping` succeeds only when a valid credential is supplied; it fails (without ever reaching the tool handler) when
  it is not.
- A spy or fixture-level assertion confirms no captured log line in the test suite ever contains the literal
  secret string used in that test.
- Live: using a real dev-stack customer service-client credential (from `scripts/keycloak/customer-fixture.ts`),
  `@modelcontextprotocol/inspector --cli` can call `ping` successfully with
  `--header "Authorization: Basic <base64>"` and fails cleanly with `401` when the header is omitted.

## Validation

```sh
corepack pnpm exec jest --runInBand apps/mcp-server/src/auth/token-cache.spec.ts
corepack pnpm typecheck
corepack pnpm lint
```

Manual/live: bring up the local dev stack (`corepack pnpm dev:reset` if a fresh stack is needed), obtain a real
customer service-client `clientId`/`clientSecret` from the seeded dev fixture, run the connector locally against
the dev stack's Keycloak, and exercise both the missing-header and valid-credential paths with
`@modelcontextprotocol/inspector --cli --transport streamable-http --header "Authorization: Basic <base64>"
--method tools/call --tool-name ping`.

```sh
corepack pnpm docs:lint -- .agents/plans/mcp-connector/02-bridge-oidc-client-credentials.md
```

## Idempotence and Recovery

The token cache is purely in-memory and process-scoped; restarting the connector clears it with no cleanup
needed. No database or persisted state is introduced by this plan. If local Keycloak state becomes inconsistent
during manual verification, `corepack pnpm dev:reset` restores a clean disposable dev stack as it already does for
every other feature in this repository.

## Artifacts and Notes

Read `scripts/proxy-fleet-swarm/m2m-token-provider.ts` and `m2m-token-provider.spec.ts` directly before
implementing — mirror their shape rather than reinventing the grant-request logic.

## Plan readiness

Ready to implement
