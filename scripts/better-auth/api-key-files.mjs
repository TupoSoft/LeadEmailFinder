import { readFile } from 'node:fs/promises'
import { assertCheckoutPrivateFile } from '../testing/development-stack.mjs'

export function validateApiKeyFixture(value, root, metadata, kind) {
    if (
        !value ||
        value.version !== 1 ||
        value.kind !== kind ||
        !['platform', 'customer', 'mcp-live'].includes(kind) ||
        value.checkoutRoot !== root ||
        value.composeProject !== metadata.composeProject ||
        value.issuer !== 'urn:lead-email-finder:auth' ||
        !/^[0-9a-f-]{36}$/.test(value.organizationId ?? '') ||
        !/^[0-9a-f-]{36}$/.test(value.credentialId ?? '') ||
        !/^lef_[A-Za-z0-9_-]{43}$/.test(value.apiKey ?? '') ||
        value.keyPrefix !== value.apiKey?.slice(0, 12)
    ) {
        throw new Error('API-key fixture metadata does not match the checkout-owned development stack')
    }
    return value
}

export async function readApiKeyFixture(root, metadata, kind) {
    if (!['platform', 'customer', 'mcp-live'].includes(kind)) throw new Error('Unknown API-key fixture')
    const file = assertCheckoutPrivateFile(root, `.dev/auth/${kind}-api-key.json`)
    let value
    try {
        value = JSON.parse(await readFile(file, 'utf8'))
    } catch {
        throw new Error('API-key fixture file is missing or invalid; run the checkout-owned development seed')
    }
    return validateApiKeyFixture(value, root, metadata, kind)
}
