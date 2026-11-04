# Keep MCP Origin Checks Runnable After Authentication

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A developer can run the existing MCP origin collection against an authenticated connector and receive the
expected success and rejection results. Valid requests provide the seeded customer's service credential;
rejected origins still fail before authentication. This delivers one implementation PR, proposed title
`test(mcp): authenticate accepted origin checks`, and restores a useful regression check for later MCP work.

## Progress

- [x] (2026-09-19) Added `clientId`/`clientSecret` to `environments/local.yml` and applied Bruno's native
      `http.auth` Basic auth to requests 02 and 03.
- [x] (2026-09-19) Added `06-allowed-origin-without-credentials.yml` and
      `07-allowed-origin-with-malformed-credentials.yml`, and rewrote the collection README.
- [x] (2026-09-19) Ran the collection twice live against a real dev-stack connector (cold and warm cache) and
      the focused checks. Recorded results below.

## Plan dependencies

- `mcp-connector/02`
- `mcp-transport-hardening/02`

## Surprises & Discoveries

PR #705 at `dffe34cc66085c042343cc5c7aaa75547aeb925f` adds an authentication gate, but both successful
initialization requests in `bruno/mcp-request-origins/` omit credentials. The review reported three passing
requests and two failures because the success requests received HTTP `401`. This plan records that review
evidence; it does not claim the correction or a new runtime check has completed.

**Implementation evidence, 2026-09-19:**

- Bruno's per-request Basic auth is not a raw header string in the OpenCollection YAML format this repository
  uses: it is a structured `http.auth: { type: basic, username, password }` block (confirmed directly from the
  installed `@usebruno/filestore@0.12.0` package's YAML parser, `formats/yml/items/parseHttpRequest.ts` and
  `formats/yml/common/auth.ts`), which the runner Base64-encodes into the `Authorization` header itself. Request
  07's deliberately malformed credential still had to be written as a literal `Authorization: Basic !!!` header,
  since that structured block cannot express an invalid value.
- Ran the full seven-request collection twice against the same live connector process without restarting it —
  once with a cold token cache, once immediately afterward with it warm from the first run — and both runs
  passed identically, confirming the acceptance criterion that a warm cache changes nothing observable here.

## Decision Log

- Decision: Extend the existing origin collection. Rationale: these requests already own the origin contract,
  and an additional collection would leave the existing failures in place. Date/Author: 2026-09-18, Codex.
- Decision: Apply Basic authentication to the two success requests individually. Rationale: collection-wide
  authentication would hide whether denied origins are checked before missing credentials. Date/Author:
  2026-09-18, Codex.
- Decision: Add missing and malformed credentials with an allowed origin. Rationale: these cases prove the
  boundary between origin acceptance and authentication without duplicating the cache workflow owned by
  `mcp-connector-hardening/01`. That cache fix is not a prerequisite for this correction. Date/Author:
  2026-09-18, Codex.

## Outcomes & Retrospective

Delivered exactly the scope this plan described: requests 02 and 03 now authenticate with the real seeded
customer credential via Bruno's native Basic-auth support, requests 04/05/06/07 prove the precedence between
origin checking and authentication (denied/null origin rejected before authentication runs; an allowed origin
with no or malformed credentials is rejected by authentication instead), and the collection README explains all
seven outcomes and the live-credential-retrieval procedure. No application code, cache semantics, or origin
policy changed — this PR is Bruno collection and documentation only.

## Context and Orientation

All paths are repository-relative. `apps/mcp-server/src/main.ts` routes public `GET /health`, then checks
`POST /mcp` in this order: origin, method, Basic credentials, token grant, and SDK transport dispatch. A missing
or malformed credential receives `401` with `{"error":"authentication_required"}`. A denied or opaque `null`
origin receives `403` with `{"error":"origin_not_allowed"}` before authentication.

The collection currently contains public health, two successful initialization requests, and two rejected-origin
requests. Its local environment defines `baseUrl`, `allowedOrigin`, and `deniedOrigin`. The successful requests
use MCP protocol version `2025-06-18`, accept JSON and Server-Sent Events, and parse the finite event response.
The transport is stateless and creates no session that needs deletion. Root Jest discovers MCP specifications.

The executable requires `OIDC_BACKCHANNEL_URL`, the realm base URL reachable from the connector process.
`TokenCache` appends `/protocol/openid-connect/token`; do not supply the full token endpoint as the base.
Existing development setup and customer fixture retrieval supply a real service client. The fixture file
`.dev/keycloak/customer-fixture.json` contains `issuer` and `keycloakClientId`, but no secret. Reuse
`loadDevelopmentStack` from `scripts/testing/development-stack.mjs` with `persistMetadata: false`, and `customerClientSecret` from
`scripts/bruno/async-verification-fixture.mjs` for read-only retrieval after validating the checkout's issuer
and the expected customer client `lef-svc-dev-fixture`.

## Scope and Non-Goals

Change only `bruno/mcp-request-origins/` and this living plan. Update `02-initialize-without-origin.yml`,
`03-initialize-with-allowed-origin.yml`, `environments/local.yml`, and `README.md`; add the two requests below.
Retain the existing health, denied-origin, and null-origin requests. No application behavior, cache semantics,
new runner, new collection, CI workflow, business tool, or database changes belong in this PR.

Credential binding, incorrect-secret checks after a successful login, and concurrent grant behavior belong to
`mcp-connector-hardening/01`. Complete package and routing startup documentation belongs to
`mcp-connector-hardening/06`; this plan updates only the origin collection's prerequisites and auth contract.

## Plan of Work

Read root `AGENTS.md` and inspect the prerequisite's delivered request gate. Before implementation, assign this
plan's synced issue and move its project item to In Progress using the root workflow. Use a clean branch for the
single implementation PR and include the synced issue's closing keyword in its description.

Add `clientId` and `clientSecret` variables to `environments/local.yml`, using
`{{process.env.MCP_AUTH_CLIENT_ID}}` and `{{process.env.MCP_AUTH_CLIENT_SECRET}}`. Keep existing URL and origin
values configurable. Apply Bruno's native per-request Basic authentication to requests 02 and 03, with these
variables as username and password. Do not store an encoded authorization value, token, or real secret in YAML.
Keep protocol headers and initialization payloads intact. Preserve successful response assertions and report a
clear failure if the expected event payload is absent, rather than accepting a status code alone.

Keep requests 01, 04, and 05 without authorization. Add `06-allowed-origin-without-credentials.yml` with the
allowed origin and no authorization, and `07-allowed-origin-with-malformed-credentials.yml` with that origin and
literal `Authorization: Basic !!!`. Both send the existing initialization body and assert HTTP `401` plus the
exact generic authentication error. These values cannot warm or reuse the token cache. Keep request sequence
numbers stable and distinct; the seven requests must run independently of any cached token from earlier runs.

Update the collection README to explain the seven outcomes and the precedence of origin checks. State the
required built connector, reachable local Keycloak realm, seeded customer client, and environment variables.
Use the existing development fixture read-only retrieval named above. Load credentials into child-process
environment variables without placing values in shell history, command-line arguments, logs, or saved reports.
Document the required `OIDC_BACKCHANNEL_URL` and matching `MCP_ALLOWED_ORIGINS` in the startup example.
No code, credential provisioning, or destructive stack reset is needed to run against a healthy seeded stack.

## Interfaces and Dependencies

Only test configuration changes: Bruno consumes `MCP_AUTH_CLIENT_ID` and `MCP_AUTH_CLIENT_SECRET`, also used by
the separate authentication collection planned in hardening plan 01. Connector configuration remains
`OIDC_BACKCHANNEL_URL`, `MCP_ALLOWED_ORIGINS`, and `PORT`. Public routes and error schemas remain unchanged.
The two prerequisites provide the authenticated connector and origin collection; no additional package is needed.

## Acceptance Criteria

- With a valid seeded customer credential, requests 02 and 03 return HTTP `200` and the expected MCP server name.
- Without credentials, health returns `200`, while denied and `null` origins return `403` with the exact origin
  error. The new allowed-origin requests return `401` with the exact authentication error.
- All seven collection requests pass twice against the same running connector, including when its cache is warm.
- No credential value, Basic authorization value, or bearer token appears in tracked files or captured output.
- The focused origin integration tests and prose checks pass. Application files and cache behavior are unchanged.

## Validation

From the repository root, run the existing origin integration coverage and build the executable:

```sh
corepack pnpm exec jest --runInBand apps/mcp-server/src/request-origin.spec.ts apps/mcp-server/src/request-origin.integration.spec.ts
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
```

These tests use isolated fixtures and are not proof of a live Keycloak exchange. For the live collection, use
an already seeded checkout-owned development stack. Load the customer credential into the two `MCP_AUTH_*`
variables and export its reachable realm base as `OIDC_BACKCHANNEL_URL` using the private retrieval procedure in the README.
Start the built connector from the repository root:

```sh
MCP_ALLOWED_ORIGINS=https://client.example PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

From the repository root in another terminal, execute the README snippet that retrieves credentials and spawns Bruno.
It must call `spawn('corepack', ['pnpm', 'exec', 'bru', 'run', '--env', 'local'], options)` twice in sequence.
Set `options.cwd` to `resolve('bruno/mcp-request-origins')` and use `stdio: 'inherit'`.
Set `options.env` to the parent environment plus `MCP_AUTH_CLIENT_ID: clientId` and `MCP_AUTH_CLIENT_SECRET: secret`.
Await each child exit and propagate failures. Keep both calls in the same Node process that retrieved the secret.
Do not expect credentials set in a child process to become available in another shell.

Confirm seven executed requests and zero failures on each run. Do not enable verbose request output or reports
that include headers. If the connector or Keycloak is unavailable, inspect YAML and scripts for static validity
and report Bruno execution as unverified. Discovery alone is not a runtime pass. From the repository root, run:

## Idempotence and Recovery

Initialization and health checks create no product data. Repeating the collection is safe and needs no cleanup.
Stop only the connector process started for validation. Restart it to clear its process-local token cache if
needed. Leave the shared development stack and fixture credentials intact; no reset or reseed is required.

## Artifacts and Notes

Record the implementation head, exact validation results, and any unavailable runtime dependencies here.
Follow root `AGENTS.md` when opening the one implementation PR. Report Bruno's actual result. Broader setup documentation in plan 06 depends on this plan to preserve the repaired requests.

## Plan readiness

Ready to implement
