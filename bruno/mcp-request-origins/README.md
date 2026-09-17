# MCP Request Origins Bruno Collection

This collection proves the `MCP_ALLOWED_ORIGINS` origin policy added by ExecPlan
`.agents/plans/mcp-transport-hardening/02-validate-request-origins.md`: `GET /health` stays public regardless of
origin, a native client that sends no `Origin` header can still initialize, the one configured allowed origin can
initialize, and both a denied origin and the opaque `null` origin are rejected with `403` and the fixed body
`{"error":"origin_not_allowed"}` before any MCP dispatch.

This is not authentication and does not enable browser access; it is a transport-level allowlist against the
requester-supplied `Origin` header, checked before the existing (currently absent) credential exchange. The
duplicate-`Origin`-header and concurrency cases this ExecPlan also requires aren't expressible as ordinary Bruno
requests (an HTTP client library normalizes or refuses to send a truly duplicate header), so those are covered
instead by the Jest integration suite `apps/mcp-server/src/request-origin.integration.spec.ts`, which sends a raw
`node:http` request to exercise them directly.

Because the connector's transport uses Server-Sent Events for a successful `initialize` response, the
initialize requests here parse the single `data: ` line out of the SSE body before asserting on the JSON
payload underneath — the raw response is not itself a JSON document.

Run it against a locally running scaffold with the allowlist configured to match this collection's
`allowedOrigin` variable:

```shell
MCP_ALLOWED_ORIGINS=https://client.example PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

From another terminal, at the repository root:

```shell
cd bruno/mcp-request-origins
corepack pnpm exec bru run --env local
```

Stop the local server with `Ctrl+C` after the collection completes. If authentication has landed since this
collection was written, retain its documented local fixture credentials and required stack; this collection
asserts origin rejection and routing only, not tool access.
