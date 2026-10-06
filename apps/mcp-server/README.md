# MCP Server

## Responsibility

`@tuposoft/lead-email-finder-mcp-server` is a standalone Node/TypeScript workspace package that exposes the
Lead Email Finder API to AI agents over the Model Context Protocol (MCP), via Streamable HTTP. It owns exactly
two things: the MCP protocol surface itself (tool registration, request/response framing, transport) and the
Basic-to-Bearer credential bridge (accepting a customer's own service-client `clientId`/`clientSecret` as HTTP
Basic auth and exchanging it for the same bearer token any other API caller would use). It owns no verification
logic, no credit policy, and no customer data of its own — every tool call is a thin, request-scoped pass-through
to the real API, and every one of those responsibilities remains owned by the modules that already implement
them (`email-verification`, `credits`, `service-client-management`). See
`.agents/plans/mcp-connector/README.md` for the road map that built this component's tools one plan at a time.

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

## Customer Setup

**1. Get a service-client credential.** Every tool call authenticates as your own organization's service-client
credential — the same `clientId`/`clientSecret` pair used for any other programmatic access to this API, with at
least the `billing:read` permission (add `verification:run`/`verification:read` for the verification and batch
tools below). See [`service-client-management`](../../src/libs/modules/service-client-management/README.md) for
how to create one from your account. Treat the secret exactly as you would any other API credential: it is shown
once at creation time and is never recoverable afterward.

**2. Configure your MCP client.** Which configuration applies depends on how your client connects:

- **Claude Desktop** cannot reach a remote HTTP URL directly from its local `mcpServers` configuration — see
  ["Connecting Claude Desktop (Local Bridge)"](#connecting-claude-desktop-local-bridge) below for the exact,
  complete setup (it needs a small local bridge process, not just this connector's URL).
- **Claude Code**, whose HTTP client path supports a genuinely remote MCP server directly, can point at this
  connector's `/mcp` URL with a Basic-auth header, for example via a project `.mcp.json`:

  ```json
  {
    "mcpServers": {
      "lead-email-finder": {
        "type": "http",
        "url": "https://<your-connector-host>/mcp",
        "headers": { "Authorization": "Basic <base64-of-client-id-colon-client-secret>" }
      }
    }
  }
  ```

  Confirm the exact configuration key names and location (project `.mcp.json` vs. a `claude mcp add` command) in
  Claude Code's own current documentation, since its CLI surface can change independently of this connector.

**3. Try it.** Ask your MCP client to check your credit balance first — it is read-only and does not spend any
credit, unlike every verification tool below.

### Tools

| Tool | Input | Example prompt |
| --- | --- | --- |
| `check_credit_balance` | none | "What's my current credit balance?" |
| `verify_email` | `{email}` | "Verify the email address jane@example.com." |
| `submit_async_verification` | `{email}` | "Submit jane@example.com for asynchronous verification." |
| `check_async_verification` | `{id}` | "Check the status of async verification `<id>`." |
| `get_verification_result` | `{id}` | "Look up the result of verification `<id>`." |
| `submit_batch_verification` | `{emails: string[]}` (up to 5000) | "Verify this list of email addresses as a batch: jane@example.com, john@example.com." |
| `check_batch_verification` | `{id}` | "What's the status of batch `<id>`?" |
| `download_batch_results` | `{id, offset?, limit?}` | "Download the first page of results from batch `<id>`." |

`verify_email` resolves synchronously when the address responds quickly, or returns an id to poll with
`check_async_verification` when it does not — never a bare timeout. `submit_batch_verification` builds the CSV
upload internally from the given address list; no local file is ever needed. `check_batch_verification`'s own
`counts` answer most "how did the batch go" questions without needing `download_batch_results`'s row-level data
at all.

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

## Retrieving the Seeded Development Credential (Repository Development Only)

This section is for developers working in this checkout, not real customers — see "Customer Setup" above for how
an actual customer obtains and uses their own credential. Public routing — `GET /health`, unrouted paths, method
rejection, and malformed-target rejection — needs no credential. A successful `POST /mcp` call does. This
checkout's development stack seeds exactly one customer service-client fixture, `lef-svc-dev-fixture`; retrieve
its *current* secret directly from Keycloak rather than from any committed file (no file contains it), and never
let the secret appear in a shell command, argument, or log line:

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

## Connecting Claude Desktop (Local Bridge)

This connector is a **loopback Compose service**, not a hosted endpoint — Claude's account-level *remote*
connectors (configured through Claude's own cloud-hosted connector settings) originate in Anthropic's own
cloud and cannot reach a `127.0.0.1` address on your machine. Claude Desktop's separate *local server*
configuration (`claude_desktop_config.json`'s `mcpServers` map) instead launches a process on your own machine,
which can make the HTTP request locally. This is the only supported way to use this connector from Claude
Desktop today; see "Cloud Remote Connectors" below for why the alternative does not apply here.

Desktop's local configuration only knows how to launch a standard-input/output process, not speak Streamable
HTTP directly, so a small bridge process is required: [`mcp-remote`](https://github.com/punkpeye/mcp-remote), a
maintained proxy that reads/writes MCP protocol frames on stdio and forwards them as HTTP requests, attaching
whatever static headers it is given. It is pinned as this package's own `mcp-remote` development dependency
(exact version `0.14.2`) — install and build the package first:

```shell
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server... install --frozen-lockfile
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
```

Find the proxy's installed executable and your native Node executable:

```shell
# The proxy's installed path (Linux/macOS shown; same relative path on Windows):
realpath apps/mcp-server/node_modules/mcp-remote/dist/proxy.js
# Your native Node executable:
which node   # macOS/Linux
where node   # Windows
```

A checkout under WSL cannot be passed directly to a *native* Windows Node executable — the paths do not resolve
across that boundary. The supported Windows baseline is a native Windows checkout with a matching native Node
install; WSL-specific launch support is out of scope here.

Copy [`examples/claude-desktop.local.json`](examples/claude-desktop.local.json) into Desktop's own configuration
file (Desktop's Developer settings show exactly where this file lives on your platform), replacing only the
placeholders — `<absolute-path-to-node-executable>`, the checkout path in the proxy's `args[0]`, and the
Base64 value in `env.LEF_MCP_AUTHORIZATION` — with real values. **Merge** the single `lead-email-finder-local`
entry into your existing `mcpServers` map; do not replace any other entry already there. The port in the example
(`53002`) matches this Compose service's own default published port (`MCP_SERVER_PORT`, see `docker/compose.yaml`)
— adjust it to match if you have overridden that variable.

The two placeholders resolve differently by platform. macOS (absolute POSIX paths, forward slashes):

```json
{
  "mcpServers": {
    "lead-email-finder-local": {
      "command": "/usr/local/bin/node",
      "args": [
        "/Users/example/LeadEmailFinder/apps/mcp-server/node_modules/mcp-remote/dist/proxy.js",
        "http://127.0.0.1:53002/mcp",
        "--transport",
        "http-only",
        "--allow-http",
        "--silent",
        "--header",
        "Authorization:${LEF_MCP_AUTHORIZATION}"
      ],
      "env": { "LEF_MCP_AUTHORIZATION": "Basic <base64-of-client-id-colon-client-secret>" }
    }
  }
}
```

Windows (native, not WSL — absolute paths with backslashes escaped as `\\` inside the JSON string):

```json
{
  "mcpServers": {
    "lead-email-finder-local": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\example\\LeadEmailFinder\\apps\\mcp-server\\node_modules\\mcp-remote\\dist\\proxy.js",
        "http://127.0.0.1:53002/mcp",
        "--transport",
        "http-only",
        "--allow-http",
        "--silent",
        "--header",
        "Authorization:${LEF_MCP_AUTHORIZATION}"
      ],
      "env": { "LEF_MCP_AUTHORIZATION": "Basic <base64-of-client-id-colon-client-secret>" }
    }
  }
}
```

The placeholder text in `args` (`Authorization:${LEF_MCP_AUTHORIZATION}`) must stay exactly as written — it is
not a shell variable to expand yourself; the proxy substitutes it internally from its own process environment at
startup, so the real credential never appears as a process argument (visible to other users on a shared
machine via `ps`) or in Desktop's own logs. The environment value is still sensitive plaintext Base64
(`Basic base64(clientId:clientSecret)`, easily reversible, not encryption) — keep `claude_desktop_config.json`
outside version control and readable only by your own account, exactly as you would any other file holding a
live credential. To prepare the value without ever echoing the real secret to your terminal history or an
online encoder, obtain your service-client's `clientId`/`clientSecret` (a credential with at least `billing:read`
is enough for the `check_credit_balance` example below; see
[`service-client-management`](../../src/libs/modules/service-client-management/README.md) for how to obtain one)
and Base64-encode `clientId:clientSecret` using a local tool that does not print or log the input, then paste
only the resulting encoded value into the configuration file.

Fully restart Claude Desktop after editing its configuration (a reload is not sufficient). Desktop should now
list this connector's tools; ask it to check the account's credit balance (`check_credit_balance`) as a first,
read-only smoke test before trying anything that spends credits. Rotating the credential means updating the
`env` value in this one entry and restarting Desktop so the next proxy process launch picks it up — no server
restart or database change is needed.

Never print an entire `claude_desktop_config.json`, a real service-client secret, or a real Base64-encoded
Authorization value in a support request, screenshot, or command output.

## Cloud Remote Connectors (Not Yet Supported)

Anthropic's account-level remote connectors ("Custom Connectors") run entirely in Anthropic's cloud and expect a
URL that Anthropic's own infrastructure can reach over the internet. This connector, as deployed by
`mcp-connector/06`, is a local-only Compose service published on `127.0.0.1`/the local network — it has no
public ingress, TLS termination, or OAuth authorization-server capability, none of which this repository's
current deployment provides. Configuring this connector's loopback URL as a cloud remote connector will not
work, regardless of any Basic-auth header UI a cloud connector configuration screen might offer. Reaching this
connector from Claude Desktop, as described above, is the only currently supported integration path.
