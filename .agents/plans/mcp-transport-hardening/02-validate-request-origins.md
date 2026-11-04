# Reject Untrusted MCP Request Origins

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

The MCP endpoint must reject a supplied origin unless the operator explicitly trusts it.
Native clients that omit the header must keep working.
A developer observes success when an untrusted origin receives HTTP 403 before protocol dispatch, while an allowed origin completes initialization and calls `ping`.

## Progress

- [x] (2026-09-17) Added `src/request-origin.ts` (configuration parser and predicate) and wired it into `main.ts`
      ahead of the existing method handling on `/mcp`.
- [x] (2026-09-17) Added `request-origin.spec.ts`, `request-origin.integration.spec.ts`, `apps/mcp-server/README.md`,
      and `bruno/mcp-request-origins/`.
- [x] (2026-09-17) Ran focused checks and the full suite, and recorded the results below.

## Plan dependencies

- `mcp-connector/01`

## Surprises & Discoveries

- A single canonical-origin check (parse with `URL`, require `http`/`https`, no userinfo, `pathname === '/'`,
  empty `search`/`hash`, and `url.origin === value`) rejects every invalid form the plan lists — a wildcard,
  `null`, a trailing slash, an explicit default port, a path, a query string, and a comma-separated value —
  without any special-casing, because each either fails `URL` parsing outright or fails to round-trip back to
  the exact input string. Verified this empirically against all of those inputs before writing the module.
- Detecting a duplicate `Origin` header (including one repeated with different capitalization) requires reading
  `req.rawHeaders` directly; Node's normalized `req.headers.origin` would already have folded duplicates by the
  time the handler sees it, no comma-splitting recovers what was actually two separate header lines.
- The existing stateless design already creates a fresh `McpServer` per POST, so an "accepted" request can call
  the mocked `createServer` boundary more than once within a single test (an `initialize` request and a
  subsequent tool call are two separate POSTs); the integration tests assert `toHaveBeenCalled()` for acceptance
  and `not.toHaveBeenCalled()` for rejection rather than an exact call count.
- The installed SDK's Streamable HTTP transport answers a successful `initialize` with a Server-Sent Events
  body, not plain JSON, even though the client also accepts `application/json`; both the integration spec and
  the Bruno collection parse the single `data: ` line out of that body before asserting on the JSON payload.
- Reused the isolated-build technique from `mcp-transport-hardening/01`'s `main.spec.ts` for the startup-config
  regression, but forked the real, unmodified `dist/main.js` entry point directly (rather than a custom
  bootstrap script) so the test exercises `main.ts`'s actual `process.env.MCP_ALLOWED_ORIGINS` parsing and
  exit-before-listen behavior, not a stand-in for it.

## Decision Log

- Decision: Accept an absent header and deny every supplied origin by default. Author: Codex, 2026-09-17.
  The scaffold uses native MCP clients, which do not need a browser origin.
  This default preserves their behavior without trusting a value supplied by the requester.
- Decision: Use an explicit origin allowlist instead of inferring trust from `Host`. Author: Codex, 2026-09-17.
  A requester controls both headers; comparing them would not protect against DNS rebinding.
- Decision: Keep validation at the HTTP boundary. Author: Codex, 2026-09-17.
  The installed SDK disables origin checks by default, and its optional protection settings are deprecated in favor of external middleware.
  A small local helper makes the rejection contract explicit and independently testable.
- Decision: Leave the listener address and CORS behavior unchanged. Author: Codex, 2026-09-17.
  This PR enforces the required origin rejection and does not introduce browser access or deployment configuration.

## Outcomes & Retrospective

Delivered exactly the scope this plan described: a pure `src/request-origin.ts` config parser and predicate, an
origin check in `main.ts` ahead of the existing (still absent) authentication and method handling on `/mcp`,
table-driven unit coverage, real HTTP integration coverage (including a raw-request child-process regression
proving invalid configuration stops startup before any listener opens), a `bruno/mcp-request-origins/` collection
run against a live local scaffold, and `apps/mcp-server/README.md` documenting the new variable. No CORS
response headers, browser client, or listener-address change was added, matching the stated non-goals.

## Context and Orientation

The reviewed implementation is PR #671 at `59d3bf3f85d69c12f7825bb998c7392ee54a97d9`.
It adds a Node HTTP process with `GET /health` and a stateless MCP endpoint at `/mcp`.
The tool factory in `apps/mcp-server/src/create-server.ts` registers only `ping`, which returns `pong`.

In `apps/mcp-server/src/main.ts`, `createApp()` routes requests and `handleMcpRequest()` constructs a fresh server and transport for each POST.
The transport receives only `sessionIdGenerator: undefined`.
SDK version 1.30.0 disables origin protection by default, and the wrapper adds no origin validation.
The review reproduced HTTP 200 for `tools/list` with both `Origin` and `Host` set to an untrusted example domain.
Only the public smoke tool exists at this head; the review demonstrated no credential or customer data exposure.

An origin identifies a scheme, hostname, and optional port, without a path.
The MCP transport specification requires HTTP 403 when a supplied origin is invalid.
An allowlist is an explicit set of origins that the operator permits.
The source for this requirement is linked in Artifacts and Notes.

Root Jest discovers MCP specifications automatically, and root typecheck includes this package after the prerequisite lands.
The original authentication bridge is a separate plan and is not a prerequisite here.
If it lands first, origin validation must run before authentication and must preserve the existing credential checks.

## Scope and Non-Goals

Proposed PR title: `fix(mcp): reject untrusted request origins`.

Change `apps/mcp-server/src/main.ts` and add `src/request-origin.ts` with `src/request-origin.spec.ts` under that package.
Add `apps/mcp-server/src/request-origin.integration.spec.ts`, a package README, and the Bruno collection described below.
Update this ExecPlan with actual evidence.

This PR adds no authentication mechanism, CORS response headers, browser client, host validation policy, or listener address change.
It changes no business module, API permission, database, container, or CI workflow.
The malformed target correction belongs to sibling plan 01 and is not a prerequisite.

## Plan of Work

First, inspect the current scaffold and any intervening authentication changes.
Keep all origin handling outside the tool factory.
Implement a pure configuration parser and a request origin predicate in `src/request-origin.ts`.
Use the built-in `URL` parser; no new package is needed.

Read `MCP_ALLOWED_ORIGINS` once during executable startup.
Treat an unset value or whitespace alone as an empty set.
For a nonempty value, split on commas, trim surrounding whitespace, and reject empty entries.
Each entry must equal its canonical `URL.origin`, use HTTP or HTTPS, and contain no credentials, path, query, or fragment.
For example, `https://client.example` and `http://localhost:4100` are valid; a wildcard, `null`, a trailing slash, and a default port written explicitly are invalid.
Collapse duplicate valid entries into one set entry.
Invalid configuration must stop startup before the listener opens, with a generic message naming only the environment variable.
Do not echo its contents.

Pass the parsed set into an optional `createApp` options object as `allowedOrigins: ReadonlySet<string>`.
Preserve an existing options object if another plan has introduced one.
Calls without this option use an empty set; tests must pass their own set without changing process environment globally.
Copy the supplied set when constructing the application so later caller mutation cannot change policy during requests.

For every request routed to `/mcp`, inspect the origin before constructing a transport or invoking any authentication exchange.
An absent `Origin` header passes this check.
A present header must occur exactly once, contain one canonical HTTP or HTTPS origin, and match the configured set exactly.
Reject empty headers, duplicate headers, comma-separated values, opaque `null`, malformed URLs, and unlisted origins.
Use the raw header list to detect duplicates, including names with different capitalization.
Do not derive an allowed origin from `Host`, forwarded headers, or the requested URL.

Return HTTP 403 with `Content-Type: application/json` and the fixed body `{"error":"origin_not_allowed"}` for a rejection.
Do not include the supplied header in errors, logs, or tool output.
Apply this check to POST, GET, and DELETE at `/mcp` before the existing method handling.
An allowed or absent origin continues through the existing authentication and method rules.
Keep `GET /health` public and keep unknown paths under the existing routing policy.

Add table-driven unit tests for configuration and header validation.
Add real HTTP integration checks on an ephemeral port using the real SDK client for accepted requests.
Use a raw Node HTTP request for duplicate and empty header cases that fetch may normalize.
Test the default empty set, an explicit allowed origin, a denied origin, a mismatched port, `null`, and multiple origin values.
Prove a rejected request never reaches the tool factory or authentication exchange using a narrow test spy on the existing boundary.
Do not add a production callback solely for this assertion.
Run allowed and denied requests concurrently to verify that no request changes policy for another.
After a rejection, verify health and an allowed `ping` call still succeed.
Close clients and servers in `finally` and bound every wait.

Add `bruno/mcp-request-origins/` for this distinct transport policy workflow.
Follow the YAML format in `bruno/m2m-oidc-authentication/`, with `opencollection.yml`, `environments/local.yml`, and a short README.
Use a local base URL of `http://127.0.0.1:3002`; allow collection environment variables to replace it.
Include health, initialization without an origin, initialization with the configured origin, and initialization with a denied origin or `null`.
Accepted initialization must use the protocol version supported by the installed SDK and both required Accept types.
Parse the finite SSE response when the transport uses SSE; do not assume every successful response is plain JSON.
Rejected requests assert HTTP 403 and the exact generic error body.
The integration tests own duplicate-header and concurrency coverage.

In `apps/mcp-server/README.md`, document the variable, strict origin format, default behavior, and native client compatibility.
If that file already exists, extend the relevant configuration section.
Do not describe the origin check as authentication or claim that it enables browser access.
Retain any existing authentication requirements in the integration fixture and collection if they have landed.
Use local fixture credentials through environment variables in that case and record the prerequisite stack needed for live Bruno execution.

## Interfaces and Dependencies

The executable reads the new optional variable `MCP_ALLOWED_ORIGINS`.
The server factory accepts an optional `allowedOrigins` set; no argument remains supported.
Rejected origins receive HTTP 403 with `{"error":"origin_not_allowed"}` before MCP dispatch.
Absent headers retain the existing native client contract.

The only implementation dependency is `mcp-connector/01`.
There is no new external library, persistence, schema change, or business module dependency.
This correction establishes the transport policy for later tools without requiring those tools to exist.

## Acceptance Criteria

- Without configured origins, a native SDK client without an origin can initialize and call `ping` under the existing authentication policy.
- A configured canonical origin can initialize and call `ping`; a different origin or port receives HTTP 403.
- Empty, duplicate, malformed, multiple, and `null` origin values receive HTTP 403 with the exact generic body.
- Setting `Host` or a forwarded header to the untrusted origin cannot make that origin pass.
- Rejected POST, GET, and DELETE requests reach neither MCP dispatch nor the authentication exchange.
- Invalid allowlist configuration stops executable startup before opening a listener and does not echo the value.
- Concurrent allowed and denied requests produce their own expected outcomes; later health and allowed calls still succeed.
- Existing health, stateless cleanup, method rejection, and authentication behavior remain covered and passing.
- Focused tests, typecheck, targeted lint, build, and the Bruno collection pass.

## Validation

After implementation, run from the repository root:

```sh
corepack pnpm exec jest --runInBand apps/mcp-server/src/request-origin.spec.ts apps/mcp-server/src/request-origin.integration.spec.ts apps/mcp-server/src/create-server.spec.ts
corepack pnpm typecheck
corepack pnpm exec eslint apps/mcp-server/src
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
git diff --check
```

The integration suite must also launch the executable with an invalid configuration in a child process.
Build a fresh executable into a unique temporary directory during test setup with the installed TypeScript compiler.
Give that directory an ESM package manifest and a link to the existing package dependencies.
Bound compilation to 30 seconds and adjust the Jest timeout to cover setup.
Do not require a manual build or depend on existing `dist` output before the Jest command runs.
Assert a nonzero exit, the generic error naming `MCP_ALLOWED_ORIGINS`, no startup success message, and no bound listener.
First prove that the same executable starts with valid configuration, so a missing build cannot satisfy the rejection test.
Use a bounded timeout and terminate that child in `finally` if it does not exit.
Remove only the temporary directory owned by this test.

For the scaffold-only live check, start the built process in one terminal:

```sh
MCP_ALLOWED_ORIGINS=https://client.example PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

In another terminal, run the standalone collection:

```sh
cd bruno/mcp-request-origins
corepack pnpm exec bru run --env local
```

Stop the process after validation.
The collection must configure `https://client.example` as its allowed test origin and a different example domain as its denied origin.
The origin without a configured entry is also covered by the automated integration suite.
If authentication has landed, supply the existing local fixture credentials and run against the required local stack.
Do not disable authentication to make a live check pass.

Bruno coverage is required because this implementation changes HTTP rejection behavior.
If runtime dependencies are unavailable, validate the collection structure and report live execution as unverified.
Planning validation does not establish that any of these runtime checks have passed.

## Idempotence and Recovery

The policy and tests store no external state.
Restart the process after changing the allowlist; active servers retain their original copy.
Repeated accepted smoke calls and rejected requests create no product data.
Close all disposable processes and sockets after tests.
To restore the previous development behavior, revert the scoped implementation and rebuild; no data reset is needed.

## Artifacts and Notes

- Review: [PR #671](https://github.com/TupoSoft/LeadEmailFinder/pull/671), head `59d3bf3f85d69c12f7825bb998c7392ee54a97d9`, finding `P3` at `apps/mcp-server/src/main.ts:25`.
- Requirement: [MCP Streamable HTTP transport security](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#security-warning).
- Installed SDK evidence: `dist/esm/server/webStandardStreamableHttp.js` defaults `enableDnsRebindingProtection` to false.
- Planning base: master `2e9701e1c3e76e7e0fefc214175fc643d22418ca`; PR #671 is still open as of 2026-09-17.
- Keep issue assignment and project status updates for implementation start, as required by root `AGENTS.md`.

## Plan readiness

Ready to implement
