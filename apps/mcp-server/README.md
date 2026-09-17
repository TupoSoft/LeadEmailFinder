# MCP Server

`@tuposoft/lead-email-finder-mcp-server` is a standalone Node/TypeScript workspace package that speaks the Model
Context Protocol (MCP) over Streamable HTTP. It has no database or business logic of its own yet; see
`.agents/plans/mcp-connector/README.md` for the road map that builds real tools on top of this scaffold.

## Running Locally

```shell
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

`GET /health` returns `200 {"status":"ok"}`. MCP requests are served at `POST /mcp` (stateless: every request gets
a fresh server and transport). `GET`/`DELETE /mcp` are rejected with `405`, and a request whose target cannot be
parsed is rejected with `400` rather than crashing the process.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3002` | The port the HTTP listener binds to. |
| `MCP_ALLOWED_ORIGINS` | unset (trust none) | A comma-separated allowlist of canonical origins (`scheme://host[:port]`, no path, query, credentials, or trailing slash) permitted to send a browser-style `Origin` header on `/mcp` requests. |

An absent `Origin` header is always accepted, so native MCP clients (Claude Desktop, Claude Code, the MCP
Inspector CLI) work with `MCP_ALLOWED_ORIGINS` unset. A *present* `Origin` header is checked strictly: it must
occur exactly once, be a single canonical `http`/`https` origin, and appear in the configured allowlist; every
other case — empty, duplicated, the opaque origin `null`, malformed, or simply unlisted — is rejected with `403
{"error":"origin_not_allowed"}` before any MCP request is dispatched. This is an origin allowlist against DNS
rebinding, not authentication, and it does not by itself enable browser access to this server.

An invalid `MCP_ALLOWED_ORIGINS` value stops the process before it opens a listener, with a generic error naming
only the variable (the configured value itself is never logged).
