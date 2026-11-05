# MCP Request Origins Bruno Collection

Seven requests check origin precedence, public health, native clients without an Origin header, allowed and denied
origins, and missing or malformed credentials. Authenticated requests use the customer API key as a Bearer value.
Origin rejection runs before authentication. The raw duplicate-header cases remain covered by
`apps/mcp-server/src/request-origin.integration.spec.ts`.

Start the connector as described in `apps/mcp-server/README.md`, setting
`MCP_ALLOWED_ORIGINS=https://client.example`. Then run from the repository root:

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

The private fixture reader verifies current checkout and stack ownership. The key remains in the child environment.
Use the same free port for the connector and `MCP_BASE_URL`. Stop the manually started connector after validation.
