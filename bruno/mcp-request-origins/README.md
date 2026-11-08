# MCP Request Origins Collection

MCP (Model Context Protocol) connects AI clients to tools. Origin identifies the caller's scheme, host, and port.
This seven-request Bruno collection checks origin-before-authentication enforcement, allowed/denied origins, native
clients without Origin, and invalid credentials. Raw duplicate-header cases use
`apps/mcp-server/src/request-origin.integration.spec.ts`.

Start the connector using [its setup guide](../../apps/mcp-server/README.md) with
`MCP_ALLOWED_ORIGINS=https://client.example`, then run from the repository root:

```shell
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { loadDevelopmentStack } from './scripts/testing/development-stack.mjs'
import { readApiKeyFixture } from './scripts/better-auth/api-key-files.mjs'
const root = process.cwd()
const stack = loadDevelopmentStack(root, { persistMetadata: false })
const customer = await readApiKeyFixture(root, stack, 'customer')
try {
    execFileSync('corepack', ['pnpm', 'exec', 'bru', 'run', '--env', 'local', '--env-var',
        `baseUrl=${process.env.MCP_BASE_URL ?? 'http://localhost:3002'}`], {
        cwd: resolve(root, 'bruno/mcp-request-origins'), stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, MCP_AUTH_API_KEY: customer.apiKey },
    })
    console.log('MCP origin collection passed')
} catch {
    throw new Error('MCP origin collection failed; raw output withheld')
}
NODE
```

The reader checks checkout/stack ownership. Keys stay in the child environment; raw output is withheld. Match
`MCP_BASE_URL` to the connector port and stop the connector afterward.
