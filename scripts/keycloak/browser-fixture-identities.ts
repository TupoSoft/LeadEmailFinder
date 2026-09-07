import { createHash } from 'node:crypto'

// These fixed passwords belong only to the disposable development fixtures. This module has no
// application or infrastructure imports so Node browser tests can use the same fixture definitions.
export const DEVELOPMENT_BROWSER_ISSUER = 'http://localhost:58080/realms/lead-email-finder'
export const CUSTOMER_OWNER_EMAIL = 'owner@acme.lef.test'
export const CUSTOMER_OWNER_PASSWORD = 'customer-owner-development-only'
export const PLATFORM_OPERATOR_EMAIL = 'platform-operator@lef.test'
export const PLATFORM_OPERATOR_PASSWORD = 'platform-operator-development-only'

export const BROWSER_FIXTURE_IDENTITIES = {
    owner: { email: CUSTOMER_OWNER_EMAIL, role: 'owner' },
    platformOperator: { email: PLATFORM_OPERATOR_EMAIL, role: 'platform_admin' },
} as const

export type BrowserFixtureLabel = keyof typeof BROWSER_FIXTURE_IDENTITIES

export interface BrowserSeedMetadata {
    version: 1
    issuer: string
    resetId: string
    users: {
        owner: { email: string; subject: string; role: 'owner' }
        platformOperator: { email: string; subject: string; role: 'platform_admin' }
    }
}

export function generateBrowserFixtureResetId(
    issuer: string,
    subjects: { owner: string; platformOperator: string },
): string {
    return createHash('sha256')
        .update(JSON.stringify([issuer, subjects.owner, subjects.platformOperator]))
        .digest('hex')
}
