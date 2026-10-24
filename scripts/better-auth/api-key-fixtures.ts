import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
    ActiveServiceCredentialReader,
    AUTH_IDENTITY_ISSUER,
    AUTH_PERMISSIONS,
    AuthPermission,
    AuthPrincipal,
    ServiceCredentialDirectory,
    ServiceCredentialDetailRecord,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'

export type ApiKeyFixtureKind = 'platform' | 'customer' | 'mcp-live'

export interface ApiKeyFixture {
    readonly version: 1
    readonly kind: ApiKeyFixtureKind
    readonly checkoutRoot: string
    readonly composeProject: string
    readonly organizationId: string
    readonly credentialId: string
    readonly issuer: typeof AUTH_IDENTITY_ISSUER
    readonly keyPrefix: string
    readonly apiKey: string
}

export const API_KEY_PATTERN = /^lef_[A-Za-z0-9_-]{43}$/
export const CUSTOMER_API_KEY_PERMISSIONS: readonly AuthPermission[] = [
    'verification:run',
    'verification:read',
    'billing:read',
]
export const MCP_API_KEY_PERMISSIONS: readonly AuthPermission[] = ['verification:run', 'verification:read']

export function parseApiKeyFixture(
    value: unknown,
    checkoutRoot: string,
    composeProject: string,
    kind: ApiKeyFixtureKind,
): ApiKeyFixture {
    const fixture = value as Partial<ApiKeyFixture> | null
    if (
        !fixture ||
        fixture.version !== 1 ||
        fixture.kind !== kind ||
        fixture.checkoutRoot !== checkoutRoot ||
        fixture.composeProject !== composeProject ||
        fixture.issuer !== AUTH_IDENTITY_ISSUER ||
        !/^[0-9a-f-]{36}$/.test(fixture.organizationId ?? '') ||
        !/^[0-9a-f-]{36}$/.test(fixture.credentialId ?? '') ||
        !API_KEY_PATTERN.test(fixture.apiKey ?? '') ||
        fixture.keyPrefix !== fixture.apiKey?.slice(0, 12)
    )
        throw new Error('API-key fixture does not belong to the current checkout and stack')
    return fixture as ApiKeyFixture
}

function permissionsFor(kind: ApiKeyFixtureKind): readonly AuthPermission[] {
    return kind === 'platform'
        ? AUTH_PERMISSIONS
        : kind === 'customer'
          ? CUSTOMER_API_KEY_PERMISSIONS
          : MCP_API_KEY_PERMISSIONS
}

/** Destructive fixture operations must prove the database row belongs to the intended fixture scope. */
export function assertApiKeyFixtureCredential(
    fixture: ApiKeyFixture,
    credential: ServiceCredentialDetailRecord,
    kind: ApiKeyFixtureKind,
): void {
    const permissions = permissionsFor(kind)
    if (
        fixture.kind !== kind ||
        credential.id !== fixture.credentialId ||
        credential.subject !== fixture.credentialId ||
        credential.organizationId !== fixture.organizationId ||
        credential.issuer !== AUTH_IDENTITY_ISSUER ||
        credential.keyPrefix !== fixture.keyPrefix ||
        credential.description !== `Seeded ${kind} API key for local development` ||
        credential.permissions.length !== permissions.length ||
        !permissions.every(permission => credential.permissions.includes(permission))
    ) {
        throw new Error('API-key fixture does not match the stored credential scope')
    }
}

/** Development-only issuance through the same transactional application port as the HTTP use cases. */
export async function seedApiKeyFixture(
    dependencies: {
        reader: ActiveServiceCredentialReader
        directory: ServiceCredentialDirectory
        writer: ServiceCredentialWriter
    },
    input: {
        checkoutRoot: string
        composeProject: string
        organizationId: string
        kind: ApiKeyFixtureKind
        previous?: ApiKeyFixture
    },
): Promise<ApiKeyFixture> {
    const description = `Seeded ${input.kind} API key for local development`
    if (input.previous) {
        const fixture = parseApiKeyFixture(input.previous, input.checkoutRoot, input.composeProject, input.kind)
        const credential = await dependencies.reader.findByKeyHash(
            createHash('sha256').update(fixture.apiKey).digest('hex'),
        )
        if (
            !credential ||
            credential.status !== 'active' ||
            credential.id !== fixture.credentialId ||
            credential.organizationId !== input.organizationId ||
            fixture.organizationId !== input.organizationId ||
            credential.keyPrefix !== fixture.keyPrefix
        ) {
            throw new Error('Stored API-key fixture is no longer active; explicitly reset the disposable fixture')
        }
        const detail = await dependencies.directory.findByIdForOrganization(
            fixture.credentialId,
            fixture.organizationId,
        )
        if (!detail) throw new Error('Stored API-key fixture is missing')
        assertApiKeyFixtureCredential(fixture, detail, input.kind)
        return fixture
    }
    const existing = await dependencies.directory.listForOrganization(input.organizationId)
    if (existing.some(credential => credential.description === description)) {
        throw new Error('API-key fixture metadata is missing; refusing automatic reissuance')
    }
    const apiKey = `lef_${randomBytes(32).toString('base64url')}`
    const id = randomUUID()
    const actor: AuthPrincipal = {
        credentialKind: 'human_session',
        issuer: AUTH_IDENTITY_ISSUER,
        subject: 'development-bootstrap',
        organizationId: input.organizationId,
        membershipRole: 'platform_admin',
        permissions: AUTH_PERMISSIONS,
        credentialId: 'development-bootstrap',
    }
    const permissions = permissionsFor(input.kind)
    await dependencies.writer.createWithAudit({
        id,
        organizationId: input.organizationId,
        issuer: AUTH_IDENTITY_ISSUER,
        subject: id,
        keyHash: createHash('sha256').update(apiKey).digest('hex'),
        keyPrefix: apiKey.slice(0, 12),
        description,
        permissions,
        actor,
    })
    return {
        version: 1,
        kind: input.kind,
        checkoutRoot: input.checkoutRoot,
        composeProject: input.composeProject,
        organizationId: input.organizationId,
        credentialId: id,
        issuer: AUTH_IDENTITY_ISSUER,
        keyPrefix: apiKey.slice(0, 12),
        apiKey,
    }
}
