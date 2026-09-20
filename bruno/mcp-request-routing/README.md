# MCP Request Routing Bruno Collection

This collection proves the plain HTTP routing of the MCP (Model Context Protocol) connector added by
`apps/mcp-server` (ExecPlan `.agents/plans/mcp-connector/01-scaffold-mcp-server-workspace.md`): `GET /health` stays
public, an unrouted path returns `404`, `GET`/`DELETE /mcp` are rejected with `405` and a JSON-RPC
method-not-allowed error, and the double-slash target `GET //` is rejected with `400 {"status":"bad_request"}` —
all without stopping the process, and with health still answering afterward.

None of these six requests need a customer credential or any container — but the process itself still requires
a reachable Keycloak realm URL to start at all (see below), since authentication is unconditional on every
`/mcp` request even though these particular requests are all rejected or routed before authentication would run.

An earlier version of this README claimed Bruno's request runner normalizes `//` before sending, and so could
not reproduce that rejection; that claim was wrong — an ordinary Bruno request to `{{baseUrl}}//` reaches the
server with the literal target `//`, exactly like `curl` or `fetch` would, and request `05` below now exercises
it directly. What Bruno's request runner genuinely cannot send is the *other* target
`mcp-transport-hardening/01` fixes, `GET http://[ HTTP/1.1`: an absolute-form request-target with an unbalanced
bracket, which Bruno itself must be able to parse as a request URL before it can open the underlying connection,
so it can never appear as the literal wire request. That target — and the proof that the same server process
survives both malformed requests and still serves a real `ping` call afterward — remains covered by the Jest
process test `apps/mcp-server/src/main.spec.ts`, which writes the literal request lines over a raw `node:net`
socket.

These requests assert routing and method rejection only, never tool access, so they need no `Authorization`
header even though the connector requires one for every other `/mcp` outcome.

Build and start the connector against this checkout's own running, seeded local development stack — see
`apps/mcp-server/README.md`'s "Running Locally" section for the exact build command and the launcher snippet
that derives the required `OIDC_BACKCHANNEL_URL` from that stack and starts `dist/main.js` in the foreground.

From another terminal, at the repository root:

```shell
cd bruno/mcp-request-routing
MCP_BASE_URL=http://127.0.0.1:3002 corepack pnpm exec bru run --env local
```

Stop the local server with `Ctrl+C` in its own terminal after the collection completes. If port `3002` is
already in use, choose a free port and use it consistently for both `PORT` and `MCP_BASE_URL`.
