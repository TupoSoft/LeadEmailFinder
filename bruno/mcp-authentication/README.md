# MCP Authentication Bruno Collection

This collection checks direct Bearer API-key authentication. A valid key initializes the connector, and incorrect or
empty keys return `401 {"error":"authentication_required"}`, and a missing credential is rejected. Each request
validates the key through the API; the connector does not exchange or cache OAuth tokens.

Build and start the connector using `apps/mcp-server/README.md`. Then run this snippet from the repository root:

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
    execFileSync('corepack', ['pnpm', 'exec', 'bru', 'run', '--env', 'local'], {
        cwd: resolve(root, 'bruno/mcp-authentication'), stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, MCP_AUTH_BASE_URL: process.env.MCP_AUTH_BASE_URL ?? 'http://localhost:3002',
            MCP_AUTH_API_KEY: customer.apiKey },
    })
    console.log('MCP authentication collection passed')
} catch {
    throw new Error('MCP authentication collection failed; raw output withheld')
}
NODE
```

The file reader verifies the checkout directory and Compose ownership and requires a private regular file with mode 0600.
The key stays in the child environment and never enters command arguments or printed output. Use
`corepack pnpm test:mcp-server-live` for committed rotation, disabling, and deletion checks covering initialize,
tool listing, and tool calls, including a key with verification permissions only.
