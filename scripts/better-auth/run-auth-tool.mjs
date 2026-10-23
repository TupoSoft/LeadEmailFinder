import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileAuthTools } from './compile-auth-tools.mjs'

// Compiles authentication tooling, then runs the requested entry point as plain Node CommonJS from the checkout.
const TOOLS = new Set(['seed-development'])
const [tool, ...args] = process.argv.slice(2)
if (!TOOLS.has(tool)) {
    process.stderr.write(`Unknown authentication tool; expected one of: ${[...TOOLS].join(', ')}\n`)
    process.exit(1)
}
const checkoutRoot = realpathSync(resolve(import.meta.dirname, '../..'))
const tools = compileAuthTools(checkoutRoot)
const result = spawnSync(process.execPath, [tools.entry(tool), ...args], { cwd: checkoutRoot, stdio: 'inherit' })
process.exit(result.status ?? 1)
