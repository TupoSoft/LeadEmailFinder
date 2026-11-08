# MCP Authentication Collection

MCP (Model Context Protocol) connects AI clients to application tools. This Bruno API-request collection checks
Bearer API keys: a valid key initializes the connector; missing, empty, or incorrect keys are rejected. Invalid keys
return `401 { "error": "authentication_required" }`. Each request validates through the API; the connector does not
exchange or cache OAuth tokens, which delegate authorization to another service.

Start the connector using [its setup guide](../../apps/mcp-server/README.md), then run from the repository root:

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

The reader checks checkout/stack ownership and mode `0600` (owner-only read/write). The key stays in the child
environment, outside arguments and output. Use `corepack pnpm test:mcp-server-live` for committed rotation,
disabling, and deletion checks across initialization, tool listing, and tool calls.
