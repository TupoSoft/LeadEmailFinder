# MCP Server

## Responsibility

`@tuposoft/lead-email-finder-mcp-server` exposes the Lead Email Finder API through stateless Streamable HTTP.
Each request authenticates with the caller's organization API key. Tools forward that same key to the API;
verification, billing, organization isolation, and permission enforcement remain application responsibilities.

## Configuration

| Variable              | Default  | Description                                                                       |
| --------------------- | -------- | --------------------------------------------------------------------------------- |
| `PORT`                | `3002`   | HTTP listener port.                                                               |
| `API_URL`             | required | Reachable Lead Email Finder API base URL.                                         |
| `MCP_ALLOWED_ORIGINS` | unset    | Comma-separated canonical HTTP or HTTPS origins allowed to send an Origin header. |

`GET /health` is public. Every `/mcp` request passes these gates before transport construction or tool registration:

1. A present Origin must occur once, be canonical, and match the configured list. Native clients without an Origin
   can connect. Rejected origins receive `403 {"error":"origin_not_allowed"}`.
2. Only POST is supported; GET and DELETE receive 405. Malformed request targets receive 400.
3. Exactly one `Authorization: Bearer <api-key>` header must contain a well-formed organization key.
4. The connector calls `GET /v1/auth/api-key` with that key before every initialize, notification, tool list,
   and tool call. No result or token is cached. Validation 401/403 becomes generic connector 401; an unavailable
   API or unexpected validation response becomes generic 503. Upstream response bodies remain private.

A key with only verification permissions can initialize and list tools. Individual tools still require their
business permissions; `check_credit_balance` requires `billing:read`.

## Customer Setup

Create an API key through the API keys screen at `/app/service-clients`. Copy or download it during its one-time
disclosure. Subsequent lists show only a safe prefix. Choose only the permissions your integration needs.
Rotation, disablement, and deletion invalidate the old key on the next authentication after commit.

For an HTTP-capable MCP client, configure its connector URL and Bearer header:

```json
{
    "mcpServers": {
        "lead-email-finder": {
            "type": "http",
            "url": "https://<your-connector-host>/mcp",
            "headers": { "Authorization": "Bearer <api-key>" }
        }
    }
}
```

Treat this configuration as a secret. Keep real credentials out of version control, commands, logs, and screenshots.

## Tools

| Tool                        | Input                                     |
| --------------------------- | ----------------------------------------- |
| `check_credit_balance`      | None                                      |
| `verify_email`              | `{email}`                                 |
| `submit_async_verification` | `{email}`                                 |
| `check_async_verification`  | `{id}`                                    |
| `get_verification_result`   | `{id}`                                    |
| `submit_batch_verification` | `{emails: string[]}` up to 5000 addresses |
| `check_batch_verification`  | `{id}`                                    |
| `download_batch_results`    | `{id, offset?, limit?}`                   |

Synchronous verification can return an ID to poll. Batch submission builds the CSV internally; downloading results
supports pagination. Every tool uses the caller's key and the upstream API's permission and credit rules.

## Running Locally

Build the package, then set `API_URL` to the reachable API or development gateway and start it:

```sh
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
API_URL=http://127.0.0.1:53000 node apps/mcp-server/dist/main.js
```

The Compose service already receives its internal API URL and publishes its listener on loopback port 53002 by
default. Use `GET /health` for a public smoke check. Choose unused ports and stop only processes you own.

Development seed tooling stores the customer key in `.dev/auth/customer-api-key.json`, a checkout-owned private
file with mode 0600. Read it with `readApiKeyFixture` from `scripts/better-auth/api-key-files.mjs` after validating
the stack through `loadDevelopmentStack`. Do not print or attach the fixture. The platform key is a separate
privileged development fixture and must not be substituted for the customer key.

## Connecting Claude Desktop

The supported local bridge is the pinned `mcp-remote` package. Build and install this workspace first. Resolve the
native Node executable and `apps/mcp-server/node_modules/mcp-remote/dist/proxy.js` to absolute paths.

Merge the entry in [`examples/claude-desktop.local.json`](examples/claude-desktop.local.json) into your existing
Desktop configuration. Replace its executable and checkout path placeholders, connector URL if needed, and
`env.LEF_MCP_AUTHORIZATION` with `Bearer <your-api-key>`. On Windows, use native Windows executable and checkout
paths, escaping backslashes in JSON. A WSL path cannot be passed directly to native Windows Node.

Keep the argument `Authorization:${LEF_MCP_AUTHORIZATION}` exactly as written. The bridge substitutes the environment
value internally, keeping the raw key out of process arguments. Keep the configuration private and outside version
control. Fully restart Desktop after changes. Rotation requires updating this environment value and restarting the
bridge. Verify a permitted read operation before performing operations that spend credits.

The Compose deployment is local and has no public ingress or OAuth authorization server. A cloud connector cannot
reach its loopback address. This change preserves the existing supported local bridge deployment.

## Validation

`corepack pnpm test -- apps/mcp-server --runInBand` covers origin and method routing, malformed targets, validation
failures, immediate revocation, concurrent caller isolation, tools, and the real pinned desktop bridge.
`corepack pnpm test:mcp-server-live` checks the owned application stack, including verification-only initialization
and old-key rejection after rotation, disablement, and deletion. Runtime validation is distinct from fixture tests.
