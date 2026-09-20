# MCP Server

`@tuposoft/lead-email-finder-mcp-server` is a standalone Node/TypeScript workspace package that speaks the Model
Context Protocol (MCP) over Streamable HTTP. It has no database or business logic of its own yet; see
`.agents/plans/mcp-connector/README.md` for the road map that builds real tools on top of this scaffold.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3002` | The port the HTTP listener binds to. |
| `OIDC_BACKCHANNEL_URL` | required, no default | The Keycloak *realm* base URL this process uses to mint bearer tokens, for example `http://localhost:58080/realms/lead-email-finder`. `TokenCache` appends `/protocol/openid-connect/token` itself, so this must be the realm URL, not the full token endpoint. An unset or empty value stops the process before it opens a listener. |
| `MCP_ALLOWED_ORIGINS` | unset (trust none) | A comma-separated allowlist of canonical origins (`scheme://host[:port]`, no path, query, credentials, or trailing slash) permitted to send a browser-style `Origin` header on `/mcp` requests. |

`GET /health` is always public and needs no credential. Every request to `/mcp` is checked in this order, and
each step must pass before the next one runs:

1. **Origin.** An absent `Origin` header is always accepted, so native MCP clients (Claude Desktop, Claude Code,
   the MCP Inspector CLI) work with `MCP_ALLOWED_ORIGINS` unset. A *present* header must occur exactly once, be a
   single canonical `http`/`https` origin, and appear in the allowlist; every other case — empty, duplicated, the
   opaque origin `null`, malformed, or simply unlisted — is rejected with `403 {"error":"origin_not_allowed"}`.
   This is a DNS-rebinding allowlist, not authentication, and does not by itself enable browser access.
2. **Method.** Only `POST /mcp` is served; `GET`/`DELETE /mcp` receive `405` with a JSON-RPC method-not-allowed
   error. A request whose target cannot be parsed at all is rejected with `400` rather than crashing the process.
3. **Authentication.** A customer's own service-client credential — the same `clientId`/`clientSecret` pair
   issued by `service-client-management` — must be presented as HTTP Basic auth
   (`Authorization: Basic base64(clientId:clientSecret)`). A missing, malformed, or rejected credential receives
   `401 {"error":"authentication_required"}` before any MCP dispatch or tool call. A valid credential is
   exchanged for a bearer token, cached per credential (see `mcp-connector/02` and `mcp-connector-hardening/01`).

Passing the origin check does not imply a valid credential, and vice versa — both are independent, unconditional
gates on every `/mcp` request.

## Running Locally

Build the package first; the compiled `dist/main.js` is not checked in:

```shell
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
```

`OIDC_BACKCHANNEL_URL` must name a realm URL this process can actually reach from wherever it runs.
`http://keycloak:8080/realms/lead-email-finder` is the Compose-internal hostname reachable only from *inside*
the Docker network (as used by the `api` service); a bare host process needs the realm's published loopback URL
instead. Against this checkout's own running, seeded local development stack, derive that URL and start the
connector in one step, from the repository root:

```shell
node --input-type=module <<'EOF'
import { spawn } from 'node:child_process'
import { loadDevelopmentStack } from './scripts/testing/development-stack.mjs'

const stack = loadDevelopmentStack(process.cwd(), { persistMetadata: false })
const child = spawn('node', ['apps/mcp-server/dist/main.js'], {
    stdio: 'inherit',
    env: {
        ...process.env,
        OIDC_BACKCHANNEL_URL: `${stack.keycloakUrl}/realms/lead-email-finder`,
        PORT: process.env.PORT ?? '3002',
    },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
const exitCode = await new Promise(resolvePromise => child.on('exit', resolvePromise))
process.exitCode = exitCode ?? 0
EOF
```

`loadDevelopmentStack` (`scripts/testing/development-stack.mjs`) fails closed unless the local Compose stack is
this checkout's own disposable one — see the root development setup and seed instructions if it isn't already
running. The snippet never prints the returned `stack` object, since it carries the local Keycloak admin
credentials. From another terminal, confirm the server answers:

```shell
curl --fail http://127.0.0.1:3002/health
```

Stop the server with `Ctrl+C` in the first terminal; the script forwards the signal to the connector process and
waits for it to exit before the script itself exits. If port `3002` is already in use, set `PORT` to a free one
consistently across every command in this document — never stop a process this checkout does not own.

## Getting a Customer Credential for Authenticated Calls

Public routing — `GET /health`, unrouted paths, method rejection, and malformed-target rejection — needs no
credential. A successful `POST /mcp` call does. This checkout's development stack seeds exactly one customer
service-client fixture, `lef-svc-dev-fixture`; retrieve its *current* secret directly from Keycloak rather than
from any committed file (no file contains it), and never let the secret appear in a shell command, argument, or
log line:

```js
import { readFile } from 'node:fs/promises'
import { customerClientSecret } from './scripts/bruno/async-verification-fixture.mjs'
import { loadDevelopmentStack } from './scripts/testing/development-stack.mjs'

const stack = loadDevelopmentStack(process.cwd(), { persistMetadata: false })
const issuer = `${stack.keycloakUrl}/realms/lead-email-finder`
const summary = JSON.parse(await readFile('.dev/keycloak/customer-fixture.json', 'utf8'))
if (summary.issuer !== issuer || summary.keycloakClientId !== 'lef-svc-dev-fixture') {
    throw new Error('Seeded customer fixture does not match the current development stack')
}
const clientSecret = await customerClientSecret(stack, summary.keycloakClientId)
// Use summary.keycloakClientId and clientSecret immediately in this same process; never print or persist either.
```

`.dev/keycloak/service-client.json` is a different, privileged platform-operator fixture — never use it as the
MCP customer credential. `bruno/mcp-request-origins/README.md` shows this exact retrieval wired directly into a
live Bruno run.
