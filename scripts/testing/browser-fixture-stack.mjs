import { fileURLToPath } from 'node:url'
import { loadDevelopmentStack } from './development-stack.mjs'

// Expose only public endpoints; the existing adapter verifies current Docker ownership.
try {
    const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
    const stack = loadDevelopmentStack(root, { persistMetadata: false })
    process.stdout.write(JSON.stringify({ origin: stack.apiUrl, issuer: `${stack.keycloakUrl}/realms/lead-email-finder` }))
} catch {
    process.stderr.write('Browser fixtures require a running development stack owned by this checkout.\n')
    process.exitCode = 1
}
