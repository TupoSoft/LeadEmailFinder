# MCP Server

## Responsibility

The **Model Context Protocol (MCP)** lets AI clients call application tools. This server uses stateless Streamable
HTTP: each request authenticates independently, without connector session state. It forwards the caller's organization
API key; verification, credits, permissions, and organization isolation remain the API's responsibility.

## Configuration

| Variable              | Default  | Purpose                                                        |
| --------------------- | -------- | -------------------------------------------------------------- |
| `PORT`                | `3002`   | HTTP listener                                                  |
| `API_URL`             | Required | Reachable application API base URL                             |
| `MCP_ALLOWED_ORIGINS` | Unset    | Comma-separated canonical HTTP(S) origins (scheme, host, port) |

`GET /health` is public. Before `/mcp` transport/tool setup:

1. A supplied Origin must occur once, be canonical, and match the allowlist; otherwise return
   `403 {"error":"origin_not_allowed"}`. Native clients may omit Origin.
2. Only POST is supported; GET/DELETE return 405 and malformed targets return 400.
3. Require exactly one well-formed `Authorization: Bearer <api-key>` header. A bearer credential authorizes its holder.
4. Validate it through `GET /v1/auth/api-key` for every initialize, notification, list, and call. Nothing is cached.
   Upstream 401/403 becomes generic connector 401; unavailability/unexpected responses become generic 503.
   Upstream bodies stay private.

Verification-only keys can initialize/list tools; each tool still checks its permissions.
`check_credit_balance` requires `billing:read`.

## Customer Setup

Create a key at `/app/service-clients`, selecting only needed permissions. Copy/download it during its one-time
reveal; later lists show a safe prefix. Committed rotation, disablement, or deletion invalidates it on the next check.

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

Keep credentials/configuration private and out of version control, commands, logs, and screenshots.

## Tools

| Tool                                                  | Input                                        |
| ----------------------------------------------------- | -------------------------------------------- |
| `check_credit_balance`                                | None                                         |
| `verify_email`, `submit_async_verification`           | `{email}`                                    |
| `check_async_verification`, `get_verification_result` | `{id}`                                       |
| `submit_batch_verification`                           | `{emails: string[]}`, maximum 5000 addresses |
| `check_batch_verification`                            | `{id}`                                       |
| `download_batch_results`                              | `{id, offset?, limit?}`                      |

Direct verification may return an ID to poll (repeatedly read until complete). Batch submission builds CSV
(comma-separated values); downloads support pagination, retrieving results in bounded pages.

## Running Locally

```sh
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
API_URL=http://127.0.0.1:3000 node apps/mcp-server/dist/main.js
```

Set `API_URL` to the separately provisioned API or gateway. The connector listens on port 3002 by default;
`PORT` overrides it. The Node listener does not limit access to loopback; restrict access when using a shared host.
No public deployment or OAuth authorization server (token-based delegation service) is provisioned. Cloud clients
need a reachable connector URL. Check `/health`, choose unused ports, and stop only owned processes.

Use an API key scoped to the customer organization and required tools. Keep it in private configuration; never
print or attach it or substitute a privileged platform credential.

## Connecting Claude Desktop

Use the pinned `mcp-remote` bridge, which adapts Desktop's local connection to HTTP. Install/build the workspace,
then merge [`examples/claude-desktop.local.json`](examples/claude-desktop.local.json) into Desktop's configuration.
Use absolute paths to native Node and `apps/mcp-server/node_modules/mcp-remote/dist/proxy.js`, set the connector URL,
and set `env.LEF_MCP_AUTHORIZATION` to `Bearer <your-api-key>`.

Keep `Authorization:${LEF_MCP_AUTHORIZATION}` unchanged: the bridge substitutes it internally so the raw key stays
out of process arguments. On Windows use native paths with escaped JSON backslashes; WSL (Windows Subsystem for
Linux) paths cannot be passed directly to Windows Node. Keep configuration outside version control. Restart Desktop
fully after setup/rotation; verify a permitted read before spending credits.

## Validation

`corepack pnpm test -- apps/mcp-server --runInBand` covers request gates, revocation, caller isolation, tools, and the
pinned bridge. Unit tests do not establish live behavior.
