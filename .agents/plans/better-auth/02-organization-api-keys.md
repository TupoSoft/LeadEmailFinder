# Replace OAuth Service Clients with Organization API Keys

This living document follows `.agents/PLANS.md` and describes exactly one implementation pull request.

## Purpose / Big Picture

Organization owners and administrators can issue a secret once and use it directly as a Bearer API key in the API,
MCP connector, and development fixtures. Rotation, disabling, and deletion take effect on the next authenticated
request after commit. The existing Keycloak browser login continues working until `better-auth/03` replaces it.

The pull request and conventional-commit subject are `feat(credentials): replace OAuth service clients with API keys`.

## Progress

- [x] (2026-10-24) Extend identity persistence and credential lifecycle transactions for hashed API keys.
- [x] (2026-10-24) Replace machine authentication and add the machine-only validation endpoint.
- [x] (2026-10-24) Update MCP, browser credential management, callers, fixtures, and HTTP contracts.
- [x] (2026-10-24) Run focused validation and review one-time secret handling and revocation races.

## Plan dependencies

- `better-auth/01`

## Surprises & Discoveries

Implementation started on 2026-10-24 at `d0efdf7`, with issue #752 assigned and marked In Progress.
The prerequisite runtime is present. This checkout still contains Harper, so prose validation remains required.

Human session principals intentionally carry `permissions: []`; auth derives their effective permissions from the
membership role. Credential use cases retain their human owner/admin check, which implies `credentials:manage`
under the current auth role policy, while HTTP also enforces the permission guard.

The complete Jest run has three failures reproduced against the unchanged starting commit with the same checkout
line endings: guest-network function extraction, reachable-history scanning, and the approval-manifest newline
assertion. Authentication, lifecycle, MCP, and fixture tests pass independently.

## Decision Log

- Decision: Keep application-owned `ServiceCredential` persistence and permissions; do not install the organization
  or API-key plugins from Better Auth. Rationale: existing organization ownership, grant ceilings, audit transactions,
  and downstream principal contracts remain the business authority. Date: 2026-10-19. Author: user and Codex.
- Decision: Preserve the resource paths and internal `service_client` credential kind while replacing OAuth client
  secrets with direct API keys. Rationale: narrow the compatibility break to machine authentication and disclosure
  fields. Date: 2026-10-19. Author: user and Codex.
- Decision: Store only the SHA-256 hash of a high-entropy key and a safe display prefix; perform an uncached database
  read for every authentication attempt. Rationale: support immediate committed revocation without recoverable secrets.
  Date: 2026-10-19. Author: Codex.

## Outcomes & Retrospective

Delivered hashed application-owned API keys, transactional issuance and audit records, uncached authentication,
and immediate committed revocation. The browser retains one-time disclosure and uncertain-outcome recovery.
MCP and development callers use direct Bearer keys. Human browser login remains on Keycloak.

Executed validation:

- Identity and credential lifecycle: 32 suites and 248 tests passed with zero skipped cases. This includes 11 real
  PostgreSQL cases for transactions, races, unique hashes, and atomic audit writes. The connection came from private temporary
  metadata for a newly created, ownership-labeled PostgreSQL 17 container and disposable `_test` database.
- Authentication, BFF, MCP, and request logging: 630 tests passed in the focused combined run. The real BFF runner
  separately executed all four required cases with zero skipped cases. Database exception logs conceal key hashes.
- Frontend: all 678 unit tests passed. All 24 mocked browser cases passed across desktop and narrow viewports.
  The real human-session lifecycle case passed create, export, list, rotate, disable, delete, and accessibility checks.
  It also proved old-key rejection after rotation despite a valid browser cookie.
- Bruno: the service-client collection passed 10 requests and 10 tests. Organization onboarding passed 23 requests
  and 23 tests. Both used the owned isolated stack and had zero skipped requests.
- The MCP live runner passed billing parity, single verification, batch submit/status/download, verification-only
  initialization and tool listing, billing denial, and old-key rejection after rotate, disable, and delete.
  Each revocation check covered initialize, list, and a tool call.
- Seed tests passed 54 cases; proxy-fleet tests passed 86 cases. The complete Node runner check passed 132 cases.
  Later focused fixture tests also passed kind isolation, unsafe file rejection, and strict cleanup handling.
- All 25 OpenAPI tests passed. API, web, and MCP builds, TypeScript checks, scoped ESLint, module architecture,
  design lint, UI audit, CI-selection fixtures, shell syntax, and Compose configuration passed.

The broad Jest snapshot passed 279 suites and 3631 tests. Three unrelated failing suites reproduced at the unchanged
starting commit with the same checkout line endings: guest-network function extraction, reachable-history scanning,
and the approval-manifest newline assertion. Optional runtime-gated cases were not counted as executed evidence.

The live stack used project `lef-752-a51f` with allocated ports. Tests preserved the default stack. Existing Windows line endings in
entry points and local secret files required normalization before container startup; normalized Git contents did not
change. Only the new owned database's password was aligned. Repeated seeds preserved fixture keys and IDs.

The optional SMTP verification overlay and Paddle sandbox were not enabled for live end-to-end checks. Their
changed callers passed fixture tests and available static checks. No provider, production, migration, or unrelated
business behavior was added. Old OAuth machine credentials require the documented disposable reset and reseed.

## Context and Orientation

Planning basis: commit `352553caa799acee39311007821d50a7a98c4cd7`. Before implementation read the root instructions,
`src/libs/modules/AGENTS.md`, its canonical README, and the identity, auth, and service-client-management README files.
For the credential screen read `apps/web/AGENTS.md`, `DESIGN.md`, `UX-CONTRACT.md`, and the local frontend design,
premium, React, and testing skills. Preserve the approved design and lifecycle behavior.

At the planning baseline, `src/libs/modules/service-client-management/` provisioned Keycloak clients and coordinated local
credential/audit writes and compensation. Identity owns the credential entity and purpose-specific persistence
ports. Auth previously verified OIDC bearer tokens and resolved them to local credentials. The API host composes bearer and
browser-cookie authenticators. MCP previously accepted HTTP Basic client credentials and cached exchanged tokens;
its initialization and tool-list requests therefore need the same replacement authentication as tool calls.

The browser route `/app/service-clients` and its shared navigation entry already implement permission filtering,
one-time disclosure, explicit rotation, unknown-outcome recovery, and secret cleanup. `scripts/keycloak/`, Bruno
runners, SMTP/Paddle fixtures, and the MCP live runner formerly minted OAuth tokens and moved together in this PR.

## Scope and Non-Goals

Replace machine credentials, their management UI, and all runtime callers. Retain existing organization roles,
permissions, isolation, resource paths, list ordering, and human-only management. Keep the Keycloak human browser
login and organization user administration available for the later browser cutover. Public registration, magic-link
screens, MFA replacement, and final container removal belong to later plans. Do not add migrations, backfills,
key expiry policy, usage metering, new permission names, or a second API-key store.

## Plan of Work

First extend the identity-owned entity, records, and reader/writer ports. Replace `keycloakClientId` and its index
with a non-null unique `keyHash` and non-null `keyPrefix`. Preserve the credential UUID and organization foreign
key. Use `AUTH_IDENTITY_ISSUER = 'urn:lead-email-finder:auth'`, exported from the framework-free identity public
barrel, and set machine `subject` to its credential UUID. Keep the issuer/subject uniqueness constraint.
Register the changed TypeORM entity through the existing identity composition; synchronize only disposable data.

Generate keys as `lef_` followed by `randomBytes(32).toString('base64url')`: exactly 47 ASCII characters. Compute the
SHA-256 hash of the complete key as 64 lowercase hexadecimal characters. Display only the first 12 key characters
as `keyPrefix`; the prefix is metadata, never a lookup or authentication credential. Keep generation/hashing in a
small infrastructure helper injected as a function into the issuance use cases. Readers return safe records rather
than exposing the hash to HTTP mappers or browser types.

Create and rotate locally through existing identity transactions. Persist the hash, prefix, and audit record in
one transaction; never put the raw key or hash in audit details. Lock or conditionally update the current scoped
credential row for rotation, disable, and delete so concurrent changes cannot resurrect a disabled/deleted key.
A failed transaction returns no usable issued key. Rotation replaces the hash and prefix while retaining the
credential ID and permissions. Retain terminal disabled status, no re-enable operation, and current 204 semantics
for disable/delete. Remove only service-client Keycloak adapters, provider calls, and compensation from this module.

Keep every management authorization check at the application boundary: `human_session`, matching organization,
owner/admin role, `credentials:manage`, and the auth-owned grant ceiling. Preserve unique, nonempty permission
selection and current role ceiling. Retain 403 for cross-organization create/list, indistinguishable 404 for missing
or foreign mutation targets, and 409 for disabled rotation. Browser CSRF and Origin checks remain enforced.

Replace the machine bearer authenticator with strict API-key parsing and hashed lookup. Reject malformed headers,
unknown hashes, disabled/deleted credentials, legacy JWT tokens, and duplicate credentials without cookie fallback.
Resolve the existing `AuthPrincipal` shape with `credentialKind: 'service_client'`, the stable application issuer,
`subject` and `credentialId` equal to the credential UUID, the stored organization, and stored permissions. Preserve
the existing service-principal role convention; it must not grant permissions beyond the stored permission set.
Do not cache successful lookups in the API or MCP process. Keep the old browser-cookie authenticator working.

Add `GET /v1/auth/api-key`. It performs ordinary machine authentication and returns empty 204 for every valid
active key, regardless of its individual business permissions; missing/invalid credentials return 401 and a valid
human session returns 403. It returns no organization, identity, permission, or key fields and uses `no-store`.
This prevents a verification-only MCP key from needing `billing:read` merely to initialize the connector.

In `apps/mcp-server/src/main.ts`, accept only `Authorization: Bearer <apiKey>`, validate it through that endpoint
before constructing the transport for every `/mcp` request, including initialize, notifications, and tools/list,
and forward the same key to downstream API calls. Remove Basic parsing, token exchange, and token caching.
Keep origin checks, stateless request isolation, health behavior, safe errors, and tool permission enforcement.
Map validation 401/403 to generic connector 401; use generic 503 for unavailable validation rather than admitting
requests or leaking upstream bodies. No transport or tool registration occurs after failed validation.

Change create/rotate HTTP disclosure to safe credential metadata plus `apiKey`; replace list `clientId` with
`keyPrefix`. No list or detail response can contain `apiKey` or `keyHash`. Preserve status codes and pre-parser
`no-store`/`no-referrer` handling. Regenerate runtime/browser OpenAPI, then update the API-key screen, navigation
copy, feature API projection, one-time reveal/copy/download, and recovery text. Keep `/app/service-clients` and
resource URLs for compatibility. Download `api-key.json` containing only `{ apiKey }`; never cache the raw key.
Record changed credential behavior in `UX-CONTRACT.md` and update relevant module/client documentation.

Adapt existing Keycloak seed orchestration to call the compiled application bootstrap from `better-auth/01` for
local key creation, while retaining Keycloak human identity seeding. The bootstrap uses application ports rather
than provider client administration or direct fixture SQL for credential creation. Store development raw keys only
in checkout-owned ignored `.dev/auth/platform-api-key.json` and `.dev/auth/customer-api-key.json` files with mode
0600 and never print them. Rerunning seed must preserve working keys rather than rotate them. Update Bruno authentication, reservation, and
customer fixtures, MCP examples/live runner, SMTP bootstrap/cleanup, and Paddle fixture instructions to use Bearer
keys. Keep fixture scopes distinct: customer keys stay least-privileged; platform fixture keys remain dev-only.

## Interfaces and Dependencies

- Identity exports the stable issuer constant and updates safe credential records and persistence commands for
  `keyPrefix` and hashing input; no framework or Better Auth types enter application/domain contracts.
- Existing `.../service-clients` routes remain. List metadata uses `keyPrefix`; create/rotate return `apiKey`
  exactly once. Existing client ID/secret response fields and machine HTTP Basic/OAuth grants are removed.
- `GET /v1/auth/api-key` validates active machine keys with no feature-permission requirement. Existing API Bearer
  transport remains, but its value is now the API key. MCP has no issuer, client-secret, or token-cache configuration.
- `better-auth/01` supplies the runtime/bootstrap infrastructure. Neither this plan nor the final system adopts
  Better Auth organization/API-key plugins. No new crypto dependency is needed.

## Acceptance Criteria

- An owner/admin creates a key, uses it on permitted API routes, and sees only its prefix on subsequent lists.
  The raw key is absent from database fields. Neither raw keys nor hashes appear in logs, audits, browser caches, or artifacts.
- API keys cannot manage keys, even with `credentials:manage`; members, foreign organizations, and excess grants
  are rejected with the preserved status codes. A valid Keycloak human session can still manage keys in this PR.
- After a committed rotate, disable, or delete, the former key fails the next API and MCP authentication; races
  cannot reactivate a key. Audit-write failure rolls back the accompanying mutation.
- A key with only verification permissions initializes MCP and lists tools; billing tools remain denied without
  `billing:read`. Invalid and revoked keys never reach transport initialization, list, or tool execution.
- Browser issuance still clears on close, auth changes, unmount, pagehide, and persisted pageshow; uncertain
  create/rotation never causes automatic replay. All updated fixture callers authenticate without OAuth exchange.
- Focused PostgreSQL, HTTP, MCP, browser, OpenAPI, Bruno, module architecture, and prose checks pass with runtime
  suites reporting executed rather than skipped coverage.

## Validation

Run focused fast checks from the repository root after adding the named authenticator and integration specs:

```bash
corepack pnpm test -- service-client api-key-credential typeorm-service-credential apps/mcp-server --runInBand
node --test scripts/bruno/*.test.mjs scripts/testing/mcp-server-live.test.mjs docker/smtp-dev/*.test.mjs
node --test scripts/openapi/*.test.mjs
corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci -- src/features/service-clients
corepack pnpm architecture:check
corepack pnpm typecheck
corepack pnpm openapi:export
corepack pnpm openapi:generate
corepack pnpm openapi:check
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
corepack pnpm --filter @tuposoft/lead-email-finder-web build
```

Add the MCP live runner's missing focused test file named above. Create
`api-key-credential-postgres.integration.spec.ts` with real transactions and gated `TEST_POSTGRES_URL`.
Using the existing checkout-owned test database, run it with `corepack pnpm test --
api-key-credential-postgres.integration.spec.ts --runInBand`; record the secret-free environment source and require
zero skipped tests. Cover concurrent rotation/disable/delete, hash uniqueness, permission lookup, and audit rollback.
Never target a database whose disposal/ownership has not been established.

After the adjusted disposable reset/seed, run `corepack pnpm test:mcp-server-live`, `corepack pnpm
bruno:service-client-rejections`, `corepack pnpm bruno:organization-onboarding`, and `corepack pnpm --filter
@tuposoft/lead-email-finder-web test:service-clients-live`. Extend the MCP live runner to prove old-key revocation
for initialize/list as well as a tool call, including a verification-only key. Keep human session success as real
browser evidence. Run the SMTP/Paddle affected fixture checks when those opt-in dependencies are available.

Run `corepack pnpm design:lint`, `corepack pnpm ui:audit`, and `git diff --check`. Run `corepack pnpm docs:lint --
<changed-markdown-files>` with the actual changed Markdown paths and record the exact expanded command/result.
Report missing external-runtime evidence precisely. Bruno is applicable and must be updated and executed through
the existing local collection launcher when its disposable dependencies are available.

## Idempotence and Recovery

API-key creation/rotation remain explicit non-idempotent issuance operations. If their responses are lost, refresh
safe metadata and explicitly rotate, disable, or delete the identified resource; never auto-retry to recover a raw
key. Disable/delete retain established repeat behavior. A key loaded for a request before revocation may finish
that request; the next authentication after commit must fail.

For the incompatible credential schema, stop only this checkout's owned stack, remove only allowlisted disposable
application state, synchronize, and rerun the updated development seed. Preserve the reset ownership/port checks;
never use a project-wide `docker compose down -v`. Existing OAuth machine credentials are intentionally discarded.
Until `better-auth/05`, keep the legacy Keycloak human setup reproducible alongside local API-key fixtures.

## Artifacts and Notes

Attach sanitized test counts, transaction-race results, OpenAPI changes, browser evidence, and revocation behavior
to the implementation PR. Do not attach raw keys, hashes, email contents, fixture files, or unfiltered logs.
The final PR uses this plan's conventional subject, links its synced issue, and updates this document as work proceeds.

Validation commands included the plan's focused Jest, PostgreSQL, web, build, architecture, and OpenAPI commands.
The isolated live commands were `corepack pnpm test:bff-live`, `corepack pnpm bruno:service-client-rejections`,
`corepack pnpm bruno:organization-onboarding`, `corepack pnpm test:mcp-server-live`, and
`PLAYWRIGHT_BROWSERS_PATH=/tmp/lef-752-playwright corepack pnpm --filter @tuposoft/lead-email-finder-web test:service-clients-live`.
Temporary containers, explicitly allowlisted volumes, images, and fixture metadata were removed after ownership
checks. The separate PostgreSQL test container was also removed. The commands used checkout-owned metadata, `COMPOSE_PROJECT_NAME=lef-752-a51f`, and allocated loopback ports; no credentials
were passed as command arguments or printed.

The exact complete prose check is:

```sh
corepack pnpm docs:lint -- .agents/plans/better-auth/02-organization-api-keys.md README.md UX-CONTRACT.md apps/mcp-server/README.md bruno/m2m-oidc-authentication/README.md bruno/mcp-authentication/README.md bruno/mcp-request-origins/README.md bruno/mcp-request-routing/README.md bruno/organization-onboarding/README.md bruno/platform-credits/README.md bruno/service-client-management/README.md bruno/smtp-dev/README.md deploy/proxy-fleet/swarm/README.md docker/README.md docker/paddle-dev/README.md docs/auth/README.md src/libs/modules/auth/README.md src/libs/modules/identity/README.md src/libs/modules/service-client-management/README.md
```

## Plan readiness

Ready to implement
