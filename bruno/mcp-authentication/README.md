# MCP Authentication Bruno Collection

This collection proves the MCP connector's credential-bound token cache added by ExecPlan
`.agents/plans/mcp-connector-hardening/01-bind-token-cache-to-credentials.md`: a valid service-client credential
can initialize the connector, an incorrect or empty secret presented under that *same* client ID is rejected with
`401 {"error":"authentication_required"}` rather than reusing the already-cached token, a request with no
credential at all is rejected the same way, and the valid credential still works afterward.

It reads the connector URL and the real credential from process environment variables — `MCP_AUTH_BASE_URL`,
`MCP_AUTH_CLIENT_ID`, and `MCP_AUTH_CLIENT_SECRET` — and never commits a real credential; the incorrect-secret and
empty-secret requests derive their (also-real) wrong values from the valid one via a collection-level
`before-request` script, so no separate secret needs to be supplied for them.

## Running It Live

Build and start the connector against the local development stack's Keycloak, from the repository root:

```shell
corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server build
OIDC_BACKCHANNEL_URL=http://localhost:58080/realms/lead-email-finder PORT=3002 \
  corepack pnpm --filter @tuposoft/lead-email-finder-mcp-server start
```

If `MCP_ALLOWED_ORIGINS` is set, this collection sends no `Origin` header, matching a native MCP client.

From another terminal, retrieve the seeded `lef-svc-dev-fixture` customer credential's *current* secret from
Keycloak and run the collection against it. The secret must never appear in a shell command, argument, or log
line, so retrieval and execution happen inside one Node process. Save the following as a temporary script (for
example `/tmp/run-mcp-authentication.mjs`) and run it with `node` from the repository root:

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

const child = spawn('corepack', ['pnpm', 'exec', 'bru', 'run', '--env', 'local'], {
    cwd: resolve(repositoryRoot, 'bruno/mcp-authentication'),
    stdio: 'inherit',
    env: {
        ...process.env,
        MCP_AUTH_BASE_URL: process.env.MCP_AUTH_BASE_URL ?? 'http://127.0.0.1:3002',
        MCP_AUTH_CLIENT_ID: summary.keycloakClientId,
        MCP_AUTH_CLIENT_SECRET: clientSecret,
    },
})
const exitCode = await new Promise(resolvePromise => child.on('exit', resolvePromise))
if (exitCode !== 0) process.exitCode = exitCode ?? 1
```

```shell
node /tmp/run-mcp-authentication.mjs
```

`loadDevelopmentStack` (`scripts/testing/development-stack.mjs`) fails closed if the local Compose stack is not
this checkout's own disposable one. `customerClientSecret` (`scripts/bruno/async-verification-fixture.mjs`) reads
the client's *current* secret directly from the Keycloak admin API using the local admin credentials — it is
never printed or logged. Stop the connector with `Ctrl+C` after the collection completes, and delete the
temporary script.
