# MCP Request Origins Bruno Collection

This collection proves the `MCP_ALLOWED_ORIGINS` origin policy added by ExecPlan
`.agents/plans/mcp-transport-hardening/02-validate-request-origins.md`, now run against the authenticated
connector delivered by `mcp-connector/02` and corrected by `mcp-connector-hardening/01` and `05`. Seven requests
cover the full precedence `main.ts` applies to `POST /mcp`, in order: origin, then method, then authentication:

1. `GET /health` stays public regardless of origin or credentials.
2. A native client sending no `Origin` header can still initialize, given a valid credential.
3. The one configured allowed origin can initialize, given a valid credential.
4. A denied origin is rejected with `403 {"error":"origin_not_allowed"}` **before** authentication runs at all —
   no credential is sent with this request, and the origin check still runs first.
5. The opaque `null` origin is rejected the same way, also with no credential sent.
6. The **allowed** origin with **no credential** is rejected with `401 {"error":"authentication_required"}` —
   proving the origin check passing is not enough on its own; authentication is a separate, later gate.
7. The allowed origin with a **malformed** Basic credential (`Authorization: Basic !!!`) is rejected the same way.

Requests 2 and 3 use Bruno's native Basic-auth support (`http.auth`), reading the real seeded customer
credential from `{{clientId}}`/`{{clientSecret}}`, which the local environment sources from the process
environment variables `MCP_AUTH_CLIENT_ID`/`MCP_AUTH_CLIENT_SECRET` (see below) — no value is committed. Requests
4–7 send no credential or a hand-written malformed one, so they never touch the token cache regardless of run
order.

This is not authentication and does not enable browser access on its own; it is a transport-level allowlist
against the requester-supplied `Origin` header. The duplicate-`Origin`-header and concurrency cases this
ExecPlan also requires aren't expressible as ordinary Bruno requests (an HTTP client library normalizes or
refuses to send a truly duplicate header), so those are covered instead by the Jest integration suite
`apps/mcp-server/src/request-origin.integration.spec.ts`, which sends a raw `node:http` request to exercise them
directly.

Because the connector's transport uses Server-Sent Events for a successful `initialize` response, the
initialize requests here parse the single `data: ` line out of the SSE body before asserting on the JSON
payload underneath — the raw response is not itself a JSON document.

## Running It Live

Build and start the connector against the local development stack's Keycloak, with the allowlist configured to
match this collection's `allowedOrigin` variable:

```shell
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
MCP_ALLOWED_ORIGINS=https://client.example \
  OIDC_BACKCHANNEL_URL=http://localhost:58080/realms/lead-email-finder \
  PORT=3002 corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

From another terminal, retrieve the seeded `lef-svc-dev-fixture` customer credential's *current* secret from
Keycloak and run the collection against it twice — once cold, once with the connector's token cache already
warm from the first run — to prove both paths succeed identically. The secret must never appear in a shell
command, argument, or log line, so retrieval and both runs happen inside one Node process. Save the following
as a temporary script (for example `/tmp/run-mcp-request-origins.mjs`) and run it with `node` from the
repository root:

```js
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { loadDevelopmentStack } from './scripts/testing/development-stack.mjs'
import { customerClientSecret } from './scripts/bruno/async-verification-fixture.mjs'

const repositoryRoot = resolve('.')
const stack = loadDevelopmentStack(repositoryRoot, { persistMetadata: false })
const issuer = `${stack.keycloakUrl}/realms/lead-email-finder`

const summary = JSON.parse(await readFile(resolve(repositoryRoot, '.dev/keycloak/customer-fixture.json'), 'utf8'))
if (summary.issuer !== issuer || summary.keycloakClientId !== 'lef-svc-dev-fixture') {
    throw new Error('Seeded customer fixture does not match the current development stack')
}

const clientSecret = await customerClientSecret(stack, summary.keycloakClientId)
const env = { ...process.env, MCP_AUTH_CLIENT_ID: summary.keycloakClientId, MCP_AUTH_CLIENT_SECRET: clientSecret }

function runOnce() {
    return new Promise((resolvePromise, reject) => {
        const child = spawn('corepack', ['pnpm', 'exec', 'bru', 'run', '--env', 'local'], {
            cwd: resolve(repositoryRoot, 'bruno/mcp-request-origins'),
            stdio: 'inherit',
            env,
        })
        child.on('exit', code => (code === 0 ? resolvePromise() : reject(new Error(`bru run exited with code ${code}`))))
    })
}

await runOnce()
console.log('--- second run (warm cache) ---')
await runOnce()
```

```shell
node /tmp/run-mcp-request-origins.mjs
```

`loadDevelopmentStack` (`scripts/testing/development-stack.mjs`) fails closed if the local Compose stack is not
this checkout's own disposable one. `customerClientSecret` (`scripts/bruno/async-verification-fixture.mjs`) reads
the client's *current* secret directly from the Keycloak admin API using the local admin credentials — it is
never printed or logged. Both `bru run` invocations must report all seven requests passing. Stop the connector
with `Ctrl+C` after the collection completes, and delete the temporary script.
