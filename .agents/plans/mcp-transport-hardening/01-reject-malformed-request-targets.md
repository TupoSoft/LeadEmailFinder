# Reject Invalid Request Targets Without Stopping the MCP Server

This ExecPlan is a living document maintained according to `.agents/PLANS.md`.

## Purpose / Big Picture

A malformed HTTP request must not stop the MCP (Model Context Protocol) server. After this change, a request
whose target cannot be parsed returns HTTP 400 with `{"status":"bad_request"}`. The same server process then
continues to answer health checks and MCP calls. A developer can observe the result with a raw socket test that
sends `GET // HTTP/1.1`, followed by a health check and a call to the `ping` tool.

This plan addresses the `P2` finding from PR #671 and maps to one implementation pull request.

## Progress

- [x] (2026-09-17) Added the narrow request parsing guard and the process regression test in `main.spec.ts`.
- [x] (2026-09-17) Added `bruno/mcp-request-routing/` with its README and ran it against a live local process.
- [x] (2026-09-17) Ran focused checks, inspected the diff, and recorded the results below.

## Plan dependencies

- `mcp-connector/01`

## Surprises & Discoveries

- Confirmed the reproduced crash directly: `new URL('//', 'http://localhost')` and
  `new URL('http://[', 'http://localhost')` both throw `TypeError [ERR_INVALID_URL]`, and Node's own HTTP parser
  accepts both `GET // HTTP/1.1` and `GET http://[ HTTP/1.1` as syntactically valid request lines, handing the raw
  target straight to the application. A raw `node:net` socket write was used to prove this for the process
  regression, but it was not the only way to reach either target: an earlier draft of this note claimed ordinary
  HTTP clients normalize `//` away and so cannot reproduce the crash, which was checked and found wrong for that
  target — `fetch`, `curl`, and Bruno all preserve a literal `//` path unmodified (`mcp-transport-hardening/03`
  added collection coverage for exactly this). The two targets are not equivalent, though: `http://[` is an
  absolute-form request-target with an unbalanced bracket, which a URL-based client library must be able to
  parse as a request URL before it can even open the connection, so no ordinary HTTP client can send it as the
  literal wire request — only a raw socket can.
- The process regression's temporary build only needed `tsc -p apps/mcp-server/tsconfig.json --outDir <tempDir>/dist`
  plus a `node_modules` directory symlink and a minimal `{"type":"module"}` manifest in the temp directory —
  `apps/mcp-server`'s own `node_modules` already contains the resolved `@modelcontextprotocol/sdk`, so no
  separate install step was needed for the isolated build.
- Verified the regression test actually detects the bug (not a false-positive pass) by temporarily reverting the
  `main.ts` fix and re-running `main.spec.ts`: the first malformed request then returned `NaN` (the raw socket
  received no valid HTTP response before the process crashed) and the second failed with `ECONNREFUSED`, because
  the child process had already exited after the first request. Restoring the fix returned both suites to green.
- Mocking `./create-server.js`'s `createServer` export only for the HTTP-500 test (via `jest.requireActual` plus
  `mockImplementationOnce`) left every other in-process test using the real implementation; the forked
  child-process regression is unaffected either way since it loads real modules from disk in a separate process.

## Decision Log

- Decision: Catch errors from request target parsing before route dispatch and return HTTP 400 with
  `{"status":"bad_request"}`. Rationale: malformed input is a client error; parsing must not throw out of the
  HTTP listener. Keep the existing response helper and avoid a new service or dependency.
  Date/Author: 2026-09-17, Codex planning.
- Decision: Use a real Node child process and a raw TCP socket for the crash regression. Rationale: one of the
  two targets (`http://[`) cannot be sent as a literal wire request by any URL-based client library, and an
  in-process test cannot safely prove that an uncaught exception leaves the whole process alive rather than
  merely rejecting one request. Date/Author: 2026-09-17, Codex planning.
- Decision: Add `bruno/mcp-request-routing` for the independent, public MCP routing workflow. Rationale: the
  repository has no existing MCP collection, and this change alters an HTTP response. Use the socket test for
  malformed wire targets and Bruno for normal requests and rejection responses.
  Date/Author: 2026-09-17, Codex planning.

## Outcomes & Retrospective

Delivered exactly the scope this plan described: a narrow `try`/`catch` around request-target parsing in
`apps/mcp-server/src/main.ts`, a Jest process regression proving the fix against a real, freshly built child
process and a real MCP SDK client, and a repeatable `bruno/mcp-request-routing/` collection for the routing
behavior a normal HTTP client can exercise. The regression's detection power was verified directly (see Surprises
& Discoveries) rather than assumed. No scope beyond the plan was added; origin validation remains
`mcp-transport-hardening/02`'s responsibility.

## Context and Orientation

All paths below are relative to the repository root. PR #671 introduces the plain Node workspace package at
`apps/mcp-server`. It depends on `@modelcontextprotocol/sdk` version `1.30.0`. It has no database or API client.
The package scripts build TypeScript and start `dist/main.js`. The `PORT` environment variable defaults to
`3002`.

`apps/mcp-server/src/main.ts` exports `createApp()`. Its HTTP listener parses `req.url` with
`new URL(req.url ?? '/', 'http://localhost')` before dispatching any route. The parse is outside an error
handler. A target that cannot be parsed therefore throws from the listener and can terminate Node.

`GET /health` returns HTTP 200 with `{"status":"ok"}`. `/mcp` accepts POST requests and creates a fresh MCP
server and transport for each request. Other methods on `/mcp` receive HTTP 405 with JSON-RPC error code
`-32000`. Unknown paths return HTTP 404 with `{"status":"not_found"}`. MCP handler failures receive HTTP 500
with JSON-RPC error code `-32603` if response headers have not been sent.

`apps/mcp-server/src/create-server.ts` registers only the public `ping` tool, which returns `pong`.
`apps/mcp-server/src/create-server.spec.ts` already checks health and tool discovery through the installed SDK.
The root Jest configuration discovers tests under this package, and the existing backend CI selection covers
changes under `apps/mcp-server/`.

## Scope and Non-Goals

Change request parsing in `apps/mcp-server/src/main.ts`. Add focused regression coverage in
`apps/mcp-server/src/main.spec.ts`. Add the Bruno collection and its README under
`bruno/mcp-request-routing/`. Update this plan with implementation evidence.

Preserve successful routing, method rejection, existing error responses, request isolation, and transport
cleanup. This plan does not add Origin checks, authentication, business tools, logging of request headers or
bodies, new packages, database changes, migrations, or deployment work. Origin validation has its own plan,
`mcp-transport-hardening/02`.

## Plan of Work

First, add a small parsing guard inside the HTTP listener. Declare the parsed URL outside a `try` block, put
only the existing URL construction inside it, and on failure call `sendJson` with HTTP 400 and
`{ status: 'bad_request' }`, then return. Dispatch routes only after parsing succeeds. Do not wrap unrelated
route handling in this catch or expose the exception text in the response.

Next, add the process regression test. Its setup must build the MCP package into a unique temporary directory
using the installed TypeScript compiler and `apps/mcp-server/tsconfig.json`. Give that directory a local
`package.json` with `type: module` and access to the package's existing `node_modules` through a directory
symlink. Use the emitted `main.js` from that fresh build, so root Jest and CI do not depend on stale or absent
`dist` output. Clean up only the directory created by this test.

Spawn Node with a small module bootstrap that imports the built `createApp()`, listens on loopback with port
`0`, and reports the assigned port to the parent through an IPC message. Track unexpected child exit as an
immediate failure. Send the literal request line `GET // HTTP/1.1`, a valid Host header, and
`Connection: close` through `node:net`. Assert HTTP 400, JSON content type, and the exact JSON body. Send a
second malformed target such as `http://[` to exercise another URL parse failure. After each rejection, issue
`GET /health` and call `ping` through the real SDK client against the same child process. Both must succeed,
and the child PID must remain the same.

Bound compiler execution to 30 seconds, server startup to 5 seconds, each network operation to 5 seconds, and
child shutdown to 5 seconds. Set an explicit Jest timeout that covers this setup. On every outcome, close SDK
clients and sockets, stop the child, escalate to a forced termination only if its shutdown deadline expires,
and remove the test's temporary directory. Add normal routing assertions for HTTP 404 and 405. Preserve the
current HTTP 500 mapping with a focused test of an MCP handler rejection before headers are sent. Use a mock
only for that otherwise difficult failure branch; the crash regression must run the real server and SDK.

Finally, create the YAML Bruno collection using the repository's existing collection format. Add
`opencollection.yml`, `environments/local.yml`, a README, and requests for `GET /health`, an unknown path,
`GET /mcp`, `DELETE /mcp`, and a final health check. Assert status codes, JSON content type, and stable response
fields. The local environment reads `baseUrl` from `MCP_BASE_URL`. The README must explain that the scaffold needs no credentials
or other services, and must distinguish the two malformed targets accurately: an ordinary client such as Bruno
can send `GET //` unmodified (`mcp-transport-hardening/03` adds collection coverage for it), but `http://[` is
an absolute-form target no URL-based client library can construct, so only the raw socket process test covers it.

If authentication lands before this implementation, preserve its checks and use the existing disposable credential fixture for accepted MCP calls.
Keep malformed target rejection before authentication; it must return HTTP 400 without exchanging credentials.
Include the existing authentication setup in the integration fixture and Bruno instructions instead of disabling it.
With sibling origin validation present, native test requests omit the origin header.

## Interfaces and Dependencies

The only new public behavior is HTTP 400 with JSON body `{"status":"bad_request"}` when URL construction
fails. The response does not contain the target, exception text, or request data. Valid request targets retain
the current behavior. No configuration, library, package interface, or business module changes are required.

The prerequisite `mcp-connector/01` supplies the server and its SDK dependency. Tests reuse Node standard
libraries, the installed TypeScript compiler, Jest, and the installed SDK. Bruno uses the already pinned
repository CLI. At the scaffold stage, the collection requires only a locally running MCP process and `MCP_BASE_URL`.
Retain the existing authentication fixture requirements if that bridge has landed.

## Acceptance Criteria

- A raw `GET // HTTP/1.1` request receives HTTP 400 and exactly `{"status":"bad_request"}` as its JSON body.
  Another target that throws during URL parsing receives the same response.
- After each rejection, the same child process answers `/health` with HTTP 200 and allows the SDK to call
  `ping` and receive `pong`. Unexpected process exit fails the test immediately.
- Valid requests retain the existing HTTP 200, 404, 405, and 500 contracts. Repeated bad requests do not
  interfere with later valid requests or create shared transport state.
- The process regression runs through the root Jest command without a prior manual build. It has bounded
  waits and leaves no child process, socket, or temporary directory after success or failure.
- The Bruno collection passes against a standalone scaffold, or the existing authenticated fixture if that bridge has landed. Its README
  accurately distinguishes its routing checks from the raw socket regression.
- Focused tests, type checks, build, lint, and plan validation pass. The final diff preserves the
  separation between HTTP handling and tool registration.

## Validation

Run these commands from the repository root after implementation. They are planned checks, not recorded
successes.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec jest --runInBand apps/mcp-server/src/main.spec.ts apps/mcp-server/src/create-server.spec.ts
corepack pnpm typecheck
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
corepack pnpm exec eslint apps/mcp-server/src/main.ts apps/mcp-server/src/main.spec.ts
corepack pnpm exec jest --runInBand scripts/plans/execplan-repository-fixture.spec.ts
```

The Jest command covers the isolated process regression, real SDK calls, route behavior, and the focused error
branch. The scaffold needs no container. For Bruno, start the built server in a separate terminal from the repository
root:

```sh
PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

From another terminal, begin at the repository root and run:

```sh
cd bruno/mcp-request-routing
MCP_BASE_URL=http://127.0.0.1:3002 corepack pnpm exec bru run --env local
```

Stop the local server with `Ctrl+C` after the collection completes. If port 3002 is occupied, choose a free port
and set both `PORT` and `MCP_BASE_URL` consistently. The scaffold requires no Keycloak, API, Redis, or PostgreSQL process.
If authentication has landed, use its documented local stack and supply fixture credentials through environment variables.
Bruno coverage is required because this implementation changes HTTP rejection behavior.
If Bruno cannot run, record the concrete dependency failure and leave runtime coverage unverified.

## Idempotence and Recovery

Tests create no business data. Each process test uses its own temporary directory and ephemeral port, so reruns
do not depend on shared state. Stop only server processes started for this validation. After an interrupted
run, remove only the test-owned temporary directory and retry. Do not reset development databases or remove
unrelated working tree changes. No schema reset, seed, migration, or rollback procedure is needed.

## Artifacts and Notes

Review evidence: PR #671 at head `59d3bf3f85d69c12f7825bb998c7392ee54a97d9`,
`apps/mcp-server/src/main.ts:36`. Sending `GET // HTTP/1.1` caused an uncaught `ERR_INVALID_URL` and process
exit code 1. The PR was open when this plan was drafted; verify the prerequisite source before implementation.
These are review observations, not results of the planned fix.

Proposed conventional commit subject and PR title:
`fix(mcp): reject malformed request targets without stopping the server`.

At implementation start, follow the repository ExecPlan workflow to find and assign the synced issue for
`mcp-transport-hardening/01` and move its project item to In Progress when access permits. At PR creation,
assign the PR to the requesting user and include the issue's closing reference. Planning alone does not mark
implementation as started.

## Plan readiness

Ready to implement
