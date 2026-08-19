import { DataSource } from 'typeorm'
import { KeycloakAdminPort } from './keycloak-admin-api'
import {
    acceptOwnerInvitation,
    createOrganizationWithOwner,
    CUSTOMER_SERVICE_CLIENT_PERMISSIONS,
    obtainClientCredentialsToken,
    provisionCustomerServiceClient,
    setCreditBalance,
    upsertCustomerServiceCredential,
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
        const fetchImpl = jest.fn().mockResolvedValue(
            jsonResponse(201, { organizationId: 'org-1', invitation: { token: 'raw-token' } }),
        )

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

    it('throws with the response body on failure', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(403, { message: 'forbidden' }))

        await expect(createOrganizationWithOwner('http://localhost:53000', 'platform-token', fetchImpl)).rejects.toThrow('403')
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
        expect(fetchImpl).toHaveBeenCalledWith('http://localhost:53000/credits/org-1', expect.objectContaining({ method: 'PUT' }))
    })
})

describe('provisionCustomerServiceClient', () => {
    it('creates the client, assigns the audience scope, and returns the secret and subject', async () => {
        const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
        api.request
            .mockResolvedValueOnce([]) // find-by-clientId: not found
            .mockResolvedValueOnce(undefined) // POST create
            .mockResolvedValueOnce([{ id: 'internal-1', clientId: 'lef-svc-dev-fixture' }]) // find-by-clientId: found
            .mockResolvedValueOnce([{ id: 'scope-1', name: 'lef-api-audience' }]) // client-scopes
            .mockResolvedValueOnce([]) // default-client-scopes: not yet assigned
            .mockResolvedValueOnce(undefined) // PUT default-client-scope
            .mockResolvedValueOnce({ value: 'a-secret' }) // GET client-secret
            .mockResolvedValueOnce({ id: 'service-account-user-1' }) // GET service-account-user

        const result = await provisionCustomerServiceClient(api, 'lef-svc-dev-fixture')

        expect(result).toEqual({ subject: 'service-account-user-1', secret: 'a-secret' })
    })
})

describe('upsertCustomerServiceCredential', () => {
    it('upserts a row scoped to MEMBER_PERMISSIONS', async () => {
        const query = jest.fn().mockResolvedValue(undefined)
        const dataSource = { query } as unknown as DataSource

        await upsertCustomerServiceCredential(dataSource, 'org-1', 'service-account-1', {
            issuer: 'http://localhost:58080/realms/lead-email-finder',
            keycloakClientId: 'lef-svc-dev-fixture',
        })

        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('ON CONFLICT (issuer, subject) DO UPDATE'),
            expect.arrayContaining(['org-1', 'service-account-1', 'lef-svc-dev-fixture', CUSTOMER_SERVICE_CLIENT_PERMISSIONS]),
        )
    })
})

describe('obtainClientCredentialsToken', () => {
    it('returns the access token on success', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { access_token: 'a-token' }))

        const token = await obtainClientCredentialsToken('https://issuer', 'client-1', 'secret', fetchImpl)

        expect(token).toBe('a-token')
    })

    it('throws when the grant fails', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid_client' }))

        await expect(obtainClientCredentialsToken('https://issuer', 'client-1', 'wrong', fetchImpl)).rejects.toThrow('invalid_client')
    })
})
