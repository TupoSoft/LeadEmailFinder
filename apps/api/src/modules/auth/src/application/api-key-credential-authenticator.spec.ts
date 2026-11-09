import { createHash } from 'node:crypto'
import {
    ActiveServiceCredentialReader,
    AUTH_IDENTITY_ISSUER,
    ServiceCredentialRecord,
} from '@tuposoft/lead-email-finder/modules/identity'
import { ApiKeyCredentialAuthenticator } from './api-key-credential-authenticator'
import { CredentialRejectedError } from './credential-authenticator'

const apiKey = `lef_${'a'.repeat(43)}`
const stored: ServiceCredentialRecord = {
    id: 'credential-1',
    organizationId: 'organization-1',
    issuer: AUTH_IDENTITY_ISSUER,
    subject: 'credential-1',
    keyPrefix: apiKey.slice(0, 12),
    permissions: ['verification:run'],
    status: 'active',
}

describe('ApiKeyCredentialAuthenticator', () => {
    const reader: jest.Mocked<ActiveServiceCredentialReader> = {
        findByIssuerAndSubject: jest.fn(),
        findByKeyHash: jest.fn(),
    }
    const hash = (key: string): string => createHash('sha256').update(key).digest('hex')
    const authenticator = new ApiKeyCredentialAuthenticator(reader, hash)
    beforeEach(() => jest.resetAllMocks())

    it('uses the complete hash and grants only stored permissions with a stable principal', async () => {
        reader.findByKeyHash.mockResolvedValue(stored)
        await expect(authenticator.authenticate({ scheme: 'bearer', token: apiKey })).resolves.toEqual({
            credentialKind: 'service_client',
            issuer: AUTH_IDENTITY_ISSUER,
            subject: stored.id,
            credentialId: stored.id,
            organizationId: stored.organizationId,
            membershipRole: 'admin',
            permissions: ['verification:run'],
        })
        expect(reader.findByKeyHash).toHaveBeenCalledWith(hash(apiKey))
    })

    it.each(['header.payload.signature', 'lef_short', `lef_${'a'.repeat(44)}`, `lef_${'/'.repeat(43)}`])(
        'rejects malformed keys and legacy JWTs before persistence lookup',
        async token => {
            await expect(authenticator.authenticate({ scheme: 'bearer', token })).rejects.toBeInstanceOf(
                CredentialRejectedError,
            )
            expect(reader.findByKeyHash).not.toHaveBeenCalled()
        },
    )

    it('rereads every request so committed rotation, disable, and deletion take effect', async () => {
        reader.findByKeyHash
            .mockResolvedValueOnce(stored)
            .mockResolvedValueOnce({ ...stored, status: 'disabled' })
            .mockResolvedValue(undefined)
        await authenticator.authenticate({ scheme: 'bearer', token: apiKey })
        await expect(authenticator.authenticate({ scheme: 'bearer', token: apiKey })).rejects.toBeInstanceOf(
            CredentialRejectedError,
        )
        await expect(authenticator.authenticate({ scheme: 'bearer', token: apiKey })).rejects.toBeInstanceOf(
            CredentialRejectedError,
        )
        expect(reader.findByKeyHash).toHaveBeenCalledTimes(3)
    })

    it('propagates persistence outages as system failures', async () => {
        const outage = new Error('database unavailable')
        reader.findByKeyHash.mockRejectedValue(outage)
        await expect(authenticator.authenticate({ scheme: 'bearer', token: apiKey })).rejects.toBe(outage)
    })
})
