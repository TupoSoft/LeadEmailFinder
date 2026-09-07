import { fileURLToPath } from 'node:url'
import { stubPaymentEnvironment } from '../bruno/run-collection.mjs'
import { inspectDevelopmentService, loadDevelopmentStack } from './development-stack.mjs'

// The MFA browser test captures this process output privately. No fixture credentials enter browser code.
try {
    const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
    const stack = loadDevelopmentStack(root, { persistMetadata: false })
    const api = inspectDevelopmentService(root, stack, 'api')
    const environment = await stubPaymentEnvironment(api.container, root, stack.apiUrl)
    process.stdout.write(JSON.stringify({ origin: stack.apiUrl, secret: environment.PAYMENTS_STUB_WEBHOOK_SECRET }))
} catch {
    process.stderr.write('Billing fixtures require a checkout-owned development stack with the stub provider.\n')
    process.exitCode = 1
}
