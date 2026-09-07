import {
    BROWSER_FIXTURE_IDENTITIES,
    type BrowserFixtureLabel,
    DEVELOPMENT_BROWSER_ISSUER,
    type BrowserSeedMetadata,
    generateBrowserFixtureResetId,
} from './browser-fixture-identities'
export { generateBrowserFixtureResetId, type BrowserSeedMetadata } from './browser-fixture-identities'
import type { KeycloakAdminPort } from './keycloak-admin-api'

const REALM_ADMIN_PATH = '/admin/realms/lead-email-finder'
const RESET_INSTRUCTION = 'Confirm ownership of the disposable development stack and run the documented reset.'

export interface BrowserFixtureUser {
    id: string
    email?: string
    username?: string
    requiredActions?: string[]
    [key: string]: unknown
}

export function assertBrowserFixtureIdentity(
    issuer: string,
    label: BrowserFixtureLabel,
    email: string,
    expectedIssuer = DEVELOPMENT_BROWSER_ISSUER,
): void {
    let validDevelopmentIssuer = false
    try {
        const parsed = new URL(expectedIssuer)
        validDevelopmentIssuer =
            parsed.protocol === 'http:' &&
            parsed.hostname === 'localhost' &&
            Boolean(parsed.port) &&
            Number(parsed.port) > 0 &&
            parsed.pathname === '/realms/lead-email-finder' &&
            !parsed.username &&
            !parsed.password &&
            !parsed.search &&
            !parsed.hash &&
            parsed.href === expectedIssuer
    } catch {
        /* Invalid issuer is rejected below without reflecting untrusted input. */
    }
    if (!validDevelopmentIssuer || issuer !== expectedIssuer || email !== BROWSER_FIXTURE_IDENTITIES[label]?.email) {
        throw new Error(`Refusing to alter an identity outside the disposable browser fixtures. ${RESET_INSTRUCTION}`)
    }
}

export async function findBrowserFixtureUser(
    api: KeycloakAdminPort,
    issuer: string,
    label: BrowserFixtureLabel,
    email: string,
    expectedIssuer = DEVELOPMENT_BROWSER_ISSUER,
): Promise<BrowserFixtureUser | undefined> {
    assertBrowserFixtureIdentity(issuer, label, email, expectedIssuer)
    const users = await api.request<BrowserFixtureUser[]>(
        'GET',
        `${REALM_ADMIN_PATH}/users?email=${encodeURIComponent(email)}&exact=true`,
    )
    if (users.length > 1 || users.some(user => !user.id || user.email !== email || user.username !== email)) {
        throw new Error(`The browser fixture identity is ambiguous or unexpected. ${RESET_INSTRUCTION}`)
    }
    return users[0]
}

export async function configureBrowserFixtureMfa(
    api: KeycloakAdminPort,
    fixture: {
        issuer: string
        label: BrowserFixtureLabel
        email: string
        subject: string
        newlyCreated: boolean
        previousSubject?: string
        expectedIssuer?: string
    },
): Promise<void> {
    const { issuer, label, email, subject, newlyCreated, previousSubject } = fixture
    assertBrowserFixtureIdentity(issuer, label, email, fixture.expectedIssuer)
    if (!newlyCreated && (!previousSubject || previousSubject !== subject)) {
        throw new Error(`An existing user has no matching development fixture provenance. ${RESET_INSTRUCTION}`)
    }
    const user = await api.request<BrowserFixtureUser>('GET', `${REALM_ADMIN_PATH}/users/${subject}`)
    if (user.id !== subject || user.email !== email || user.username !== email) {
        throw new Error(`The browser fixture identity does not match its seed. ${RESET_INSTRUCTION}`)
    }
    const roles = await api.request<Array<{ name: string }>>(
        'GET',
        `${REALM_ADMIN_PATH}/users/${subject}/role-mappings/realm/composite`,
    )
    const expectedRole = BROWSER_FIXTURE_IDENTITIES[label].role
    if (
        !roles.some(role => role.name === expectedRole) ||
        !roles.some(role => role.name === 'mfa_required') ||
        roles.some(role => ['owner', 'admin', 'platform_admin'].includes(role.name) && role.name !== expectedRole)
    ) {
        throw new Error(`The browser fixture is missing its expected role or MFA requirement. ${RESET_INSTRUCTION}`)
    }
    const credentials = await api.request<Array<{ type: string }>>(
        'GET',
        `${REALM_ADMIN_PATH}/users/${subject}/credentials`,
    )
    if (credentials.some(credential => credential.type === 'otp') || user.requiredActions?.includes('CONFIGURE_TOTP')) {
        return
    }
    if (!newlyCreated) {
        throw new Error(`An existing browser fixture has lost its MFA enrollment state. ${RESET_INSTRUCTION}`)
    }
    await api.request(
        'PUT',
        `${REALM_ADMIN_PATH}/users/${subject}`,
        { ...user, requiredActions: [...(user.requiredActions ?? []), 'CONFIGURE_TOTP'] },
        [204],
    )
}

export function createBrowserSeedMetadata(
    subjects: { owner: string; platformOperator: string },
    issuer = DEVELOPMENT_BROWSER_ISSUER,
): BrowserSeedMetadata {
    assertBrowserFixtureIdentity(issuer, 'owner', BROWSER_FIXTURE_IDENTITIES.owner.email, issuer)
    if (!subjects.owner || !subjects.platformOperator || subjects.owner === subjects.platformOperator) {
        throw new Error('Browser fixture seed subjects must be present and distinct.')
    }
    return {
        version: 1,
        issuer,
        resetId: generateBrowserFixtureResetId(issuer, subjects),
        users: {
            owner: { ...BROWSER_FIXTURE_IDENTITIES.owner, subject: subjects.owner },
            platformOperator: { ...BROWSER_FIXTURE_IDENTITIES.platformOperator, subject: subjects.platformOperator },
        },
    }
}
