import { DataSource } from 'typeorm'
import { KeycloakAdminPort } from './keycloak-admin-api'
import {
    acceptOwnerInvitation,
    createOrganizationWithOwner,
    setCreditBalance,
    seedCustomerFixture,
} from './customer-fixture'

function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response
}

describe('createOrganizationWithOwner', () => {
    it('creates the organization and returns the invitation token', async () => {
        const fetchImpl = jest
            .fn()
            .mockResolvedValue(jsonResponse(201, { organizationId: 'org-1', invitation: { token: 'raw-token' } }))

        const result = await createOrganizationWithOwner('http://localhost:53000', 'platform-token', fetchImpl)

        expect(result).toEqual({ organizationId: 'org-1', invitationToken: 'raw-token' })
        expect(fetchImpl).toHaveBeenCalledWith(
            'http://localhost:53000/v1/organizations',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ authorization: 'Bearer platform-token' }),
            }),
        )
    })

    it('reports only the status on failure', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(403, { message: 'forbidden' }))

        await expect(
            createOrganizationWithOwner('http://localhost:53000', 'platform-token', fetchImpl),
        ).rejects.toThrow('403')
    })
})

describe('acceptOwnerInvitation', () => {
    it('posts the password with no authorization header', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(201, {}))

        await acceptOwnerInvitation('http://localhost:53000', 'raw-token', 'a-password', fetchImpl)

        const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
        expect(init.headers).not.toHaveProperty('authorization')
        expect(JSON.parse(init.body as string)).toEqual({ password: 'a-password' })
    })
})

describe('setCreditBalance', () => {
    it('sets the balance and returns it', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { balance: 1000 }))

        const balance = await setCreditBalance('http://localhost:53000', 'platform-token', 'org-1', 1000, fetchImpl)

        expect(balance).toBe(1000)
        expect(fetchImpl).toHaveBeenCalledWith(
            'http://localhost:53000/credits/org-1',
            expect.objectContaining({ method: 'PUT' }),
        )
    })
})

describe('seedCustomerFixture', () => {
    const previousFixture = {
        issuer: 'http://localhost:58080/realms/lead-email-finder',
        organizationId: 'org-1',
        ownerEmail: 'owner@acme.lef.test',
        ownerSubject: 'owner-1',
        credentialId: 'credential-1',
        keyPrefix: 'lef_abcdefgh',
        issuers: ['http://localhost:58080/realms/lead-email-finder'],
    }
    const owner = { id: 'owner-1', email: 'owner@acme.lef.test', username: 'owner@acme.lef.test' }

    it('seeds the customer key through the supplied application bootstrap', async () => {
        const issuer = 'http://localhost:58080/realms/lead-email-finder'
        const fetchImpl = jest
            .fn()
            .mockResolvedValueOnce(jsonResponse(201, { organizationId: 'org-1', invitation: { token: 'invitation' } }))
            .mockResolvedValueOnce(jsonResponse(201, {}))
            .mockResolvedValueOnce(jsonResponse(200, { balance: 1000 }))
        const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
        api.request
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'owner-1', email: 'owner@acme.lef.test', username: 'owner@acme.lef.test' }])
            .mockResolvedValueOnce({ id: 'owner-1', email: 'owner@acme.lef.test', username: 'owner@acme.lef.test' })
            .mockResolvedValueOnce([{ name: 'owner' }, { name: 'mfa_required' }])
            .mockResolvedValueOnce([{ type: 'password' }])
            .mockResolvedValueOnce(undefined)

        const query = jest.fn().mockResolvedValue(undefined)

        const result = await seedCustomerFixture({
            apiUrl: 'http://localhost:53000',
            issuer,
            platformToken: 'test-token',
            api,
            dataSource: { query } as unknown as DataSource,
            fetchImpl,
            seedApiKey: jest.fn().mockResolvedValue({ credentialId: 'credential-1', keyPrefix: 'lef_abcdefgh' }),
        })

        expect(result.issuers).toEqual([issuer])
        expect(result.ownerSubject).toBe('owner-1')
        expect(query).not.toHaveBeenCalled()
        expect(JSON.stringify(query.mock.calls)).not.toContain('keycloak:8080')
    })

    it('reuses the verified customer membership and preserves the enrolled owner on a routine rerun', async () => {
        const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
        api.request
            .mockResolvedValueOnce([owner])
            .mockResolvedValueOnce(owner)
            .mockResolvedValueOnce([{ name: 'owner' }, { name: 'mfa_required' }])
            .mockResolvedValueOnce([{ type: 'password' }, { type: 'otp' }])

        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { balance: 1000 }))
        const query = jest
            .fn()
            .mockResolvedValueOnce([{ matches: true }])
            .mockResolvedValueOnce(undefined)
        const result = await seedCustomerFixture({
            apiUrl: 'http://localhost:53000',
            issuer: previousFixture.issuer,
            platformToken: 'test-token',
            api,
            dataSource: { query } as unknown as DataSource,
            fetchImpl,
            seedApiKey: jest.fn().mockResolvedValue({ credentialId: 'credential-1', keyPrefix: 'lef_abcdefgh' }),
            previousFixture,
        })
        expect(result).toEqual(previousFixture)
        expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('SELECT EXISTS'), [
            previousFixture.issuer,
            owner.id,
            previousFixture.organizationId,
        ])
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(fetchImpl).toHaveBeenCalledWith('http://localhost:53000/credits/org-1', expect.anything())
        expect(api.request.mock.calls.every(([method]) => method === 'GET')).toBe(true)
    })

    it.each([undefined, { ...previousFixture, ownerSubject: 'stale' }])(
        'refuses a preexisting owner without matching local seed provenance',
        async previous => {
            const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
            api.request.mockResolvedValue([owner])
            const fetchImpl = jest.fn()
            const query = jest.fn()
            await expect(
                seedCustomerFixture({
                    apiUrl: 'http://localhost:53000',
                    issuer: previousFixture.issuer,
                    platformToken: 'test-token',
                    api,
                    dataSource: { query } as unknown as DataSource,
                    fetchImpl,
                    seedApiKey: jest
                        .fn()
                        .mockResolvedValue({ credentialId: 'credential-1', keyPrefix: 'lef_abcdefgh' }),
                    previousFixture: previous,
                }),
            ).rejects.toThrow('provenance')
            expect(fetchImpl).not.toHaveBeenCalled()
            expect(query).not.toHaveBeenCalled()
            expect(api.request).toHaveBeenCalledTimes(1)
        },
    )

    it('rejects an organization mismatch before changing balances or users', async () => {
        const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
        api.request.mockResolvedValue([owner])
        const fetchImpl = jest.fn()
        const query = jest.fn().mockResolvedValue([{ matches: false }])
        await expect(
            seedCustomerFixture({
                apiUrl: 'http://localhost:53000',
                issuer: previousFixture.issuer,
                platformToken: 'test-token',
                api,
                dataSource: { query } as unknown as DataSource,
                fetchImpl,
                seedApiKey: jest.fn().mockResolvedValue({ credentialId: 'credential-1', keyPrefix: 'lef_abcdefgh' }),
                previousFixture,
            }),
        ).rejects.toThrow('active owner membership')
        expect(fetchImpl).not.toHaveBeenCalled()
        expect(api.request).toHaveBeenCalledTimes(1)
    })
})
