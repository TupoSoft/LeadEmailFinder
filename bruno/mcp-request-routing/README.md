# MCP Request Routing Bruno Collection

This collection proves the plain HTTP routing of the MCP (Model Context Protocol) connector added by
`apps/mcp-server` (ExecPlan `.agents/plans/mcp-connector/01-scaffold-mcp-server-workspace.md`): `GET /health` stays
public, an unrouted path returns `404`, and `GET`/`DELETE /mcp` are rejected with `405` and a JSON-RPC
method-not-allowed error, all without stopping the process.

The scaffold needs no credentials, container, or other service; a plain `node dist/main.js` process is enough.
This collection does not send the raw malformed wire request that `mcp-transport-hardening/01` fixes (for
example `GET // HTTP/1.1`) — a normal HTTP client such as Bruno's own request runner normalizes `//` before the
request ever reaches the server, so it cannot reproduce that failure. That regression is instead covered by the
Jest process test `apps/mcp-server/src/main.spec.ts`, which writes the literal request line over a raw
`node:net` socket and asserts the server keeps answering afterward.

If authentication has landed since this collection was written, the `/mcp` request tests below assert only
routing and method rejection, not tool access; retain the documented local fixture credentials if the requests
have grown an `Authorization` header.

Run it against a locally running scaffold:

```shell
PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

From another terminal, at the repository root:

```shell
cd bruno/mcp-request-routing
MCP_BASE_URL=http://127.0.0.1:3002 corepack pnpm exec bru run --env local
```

Stop the local server with `Ctrl+C` after the collection completes.
