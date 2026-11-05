import { createHash } from 'node:crypto'
import {
    ActiveServiceCredentialReader,
    ServiceCredentialDirectory,
    ServiceCredentialDetailRecord,
    ServiceCredentialWriter,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ApiKeyFixture, assertApiKeyFixtureCredential, parseApiKeyFixture, seedApiKeyFixture } from './api-key-fixtures'

const input = {
    checkoutRoot: '/checkout',
    composeProject: 'lef',
    organizationId: '11111111-1111-4111-8111-111111111111',
    kind: 'customer' as const,
}
function dependencies(): {
    reader: jest.Mocked<ActiveServiceCredentialReader>
    directory: jest.Mocked<ServiceCredentialDirectory>
    writer: jest.Mocked<ServiceCredentialWriter>
} {
    return {
        reader: { findByKeyHash: jest.fn() } as unknown as jest.Mocked<ActiveServiceCredentialReader>,
        directory: {
            listForOrganization: jest.fn().mockResolvedValue([]),
            findByIdForOrganization: jest.fn(),
        } as unknown as jest.Mocked<ServiceCredentialDirectory>,
        writer: { createWithAudit: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<ServiceCredentialWriter>,
    }
}

function recordFor(fixture: ApiKeyFixture): ServiceCredentialDetailRecord {
    return {
        id: fixture.credentialId,
        subject: fixture.credentialId,
        issuer: fixture.issuer,
        organizationId: fixture.organizationId,
        keyPrefix: fixture.keyPrefix,
        status: 'active',
        permissions: ['verification:run', 'verification:read', 'billing:read'],
        description: 'Seeded customer API key for local development',
        createdAt: new Date(),
        updatedAt: new Date(),
    }
}

describe('development API-key fixtures', () => {
    it('discloses a key once to private metadata while the application port sees only the hash and prefix', async () => {
        const deps = dependencies()
        const fixture = await seedApiKeyFixture(deps, input)
        expect(fixture.apiKey).toMatch(/^lef_[A-Za-z0-9_-]{43}$/)
        expect(deps.writer.createWithAudit).toHaveBeenCalledWith(
            expect.objectContaining({
                id: fixture.credentialId,
                subject: fixture.credentialId,
                keyPrefix: fixture.apiKey.slice(0, 12),
                keyHash: createHash('sha256').update(fixture.apiKey).digest('hex'),
                permissions: ['verification:run', 'verification:read', 'billing:read'],
            }),
        )
        expect(JSON.stringify(deps.writer.createWithAudit.mock.calls)).not.toContain(fixture.apiKey)
    })
    it('preserves an existing working key and refuses revoked or missing metadata', async () => {
        const deps = dependencies()
        const previous = await seedApiKeyFixture(deps, input)
        deps.writer.createWithAudit.mockClear()
        deps.reader.findByKeyHash.mockResolvedValue({
            id: previous.credentialId,
            organizationId: previous.organizationId,
            keyPrefix: previous.keyPrefix,
            status: 'active',
        } as Awaited<ReturnType<ActiveServiceCredentialReader['findByKeyHash']>>)
        deps.directory.findByIdForOrganization.mockResolvedValue(recordFor(previous))
        expect(await seedApiKeyFixture(deps, { ...input, previous })).toBe(previous)
        expect(deps.writer.createWithAudit).not.toHaveBeenCalled()
        deps.reader.findByKeyHash.mockResolvedValue(undefined)
        await expect(seedApiKeyFixture(deps, { ...input, previous })).rejects.toThrow('no longer active')
        deps.directory.listForOrganization.mockResolvedValue([
            { description: 'Seeded customer API key for local development' },
        ] as unknown as Awaited<ReturnType<ServiceCredentialDirectory['listForOrganization']>>)
        await expect(seedApiKeyFixture(deps, input)).rejects.toThrow('metadata is missing')
    })
    it('rejects foreign provenance and malformed keys without exposing them', async () => {
        const fixture = await seedApiKeyFixture(dependencies(), input)
        expect(() => parseApiKeyFixture(fixture, '/other', 'lef', 'customer')).toThrow('current checkout')
        expect(() =>
            parseApiKeyFixture({ ...fixture, apiKey: 'sensitive-invalid' }, '/checkout', 'lef', 'customer'),
        ).toThrow('current checkout')
    })
    it('refuses customer metadata copied to the MCP fixture even if its declared kind is forged', async () => {
        const deps = dependencies()
        const fixture = await seedApiKeyFixture(deps, input)
        deps.writer.createWithAudit.mockClear()
        await expect(seedApiKeyFixture(deps, { ...input, kind: 'mcp-live', previous: fixture })).rejects.toThrow(
            'current checkout',
        )
        const forged = { ...fixture, kind: 'mcp-live' as const }
        const credential = recordFor(fixture)
        deps.reader.findByKeyHash.mockResolvedValue(credential)
        deps.directory.findByIdForOrganization.mockResolvedValue(credential)
        await expect(seedApiKeyFixture(deps, { ...input, kind: 'mcp-live', previous: forged })).rejects.toThrow(
            'stored credential scope',
        )
        // The mutation entry point calls this guard before rotate, disable, or delete.
        expect(() => assertApiKeyFixtureCredential(forged, credential, 'mcp-live')).toThrow('stored credential scope')
        expect(deps.writer.createWithAudit).not.toHaveBeenCalled()
    })
})
