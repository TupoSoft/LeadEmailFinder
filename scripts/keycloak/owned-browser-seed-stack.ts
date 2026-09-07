import { createRequire } from 'node:module'
import { resolve } from 'node:path'

interface OwnedBrowserSeedStack {
    apiUrl: string
    keycloakUrl: string
    postgresUrl: string
    keycloakAdminUsername: string
    keycloakAdminPassword: string
}

// Node's synchronous ESM loading shares the same ownership validator as the live-test launcher.
const { loadDevelopmentStack } = createRequire(__filename)('../testing/development-stack.mjs') as {
    loadDevelopmentStack: (checkoutRoot: string, options: { persistMetadata: boolean }) => OwnedBrowserSeedStack
}

export function loadOwnedBrowserSeedStack(): OwnedBrowserSeedStack {
    const stack = loadDevelopmentStack(resolve(__dirname, '../..'), { persistMetadata: false })
    if (
        (process.env.KEYCLOAK_URL && process.env.KEYCLOAK_URL !== stack.keycloakUrl) ||
        (process.env.API_URL && process.env.API_URL !== stack.apiUrl)
    ) {
        throw new Error('Browser fixture seed endpoints do not match the confirmed checkout-owned stack.')
    }
    return stack
}
