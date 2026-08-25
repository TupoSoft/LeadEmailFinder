import { KeycloakAdminHttpClient } from './keycloak-admin-http-client.service'
import { KeycloakAdminHttpConfiguration } from './keycloak-admin-http-configuration'
import { KeycloakServiceClientAdminClient } from './keycloak-service-client-admin-client.service'

const configuration: KeycloakAdminHttpConfiguration = {
    baseUrl: 'http://localhost:58080',
    realm: 'lead-email-finder',
    clientId: 'lef-org-admin-service',
    clientSecret: 'secret',
}

describe('KeycloakServiceClientAdminClient', () => {
    let httpMock: jest.Mocked<Pick<KeycloakAdminHttpClient, 'request'>>
    let adapter: KeycloakServiceClientAdminClient

    beforeEach(() => {
        httpMock = { request: jest.fn() }
        adapter = new KeycloakServiceClientAdminClient(httpMock as unknown as KeycloakAdminHttpClient, configuration)
    })

    describe('provisionClient', () => {
        it('creates the client, assigns the audience scope, and returns the secret and subject', async () => {
            httpMock.request
                .mockResolvedValueOnce([]) // find-by-clientId: not found
                .mockResolvedValueOnce(undefined) // POST create
                .mockResolvedValueOnce([{ id: 'internal-1', clientId: 'lef-svc-1' }]) // find-by-clientId: found
                .mockResolvedValueOnce([{ id: 'scope-1', name: 'lef-api-audience' }]) // client-scopes
                .mockResolvedValueOnce([]) // default-client-scopes: not yet assigned
                .mockResolvedValueOnce(undefined) // PUT default-client-scope
                .mockResolvedValueOnce({ value: 'a-secret' }) // GET client-secret
                .mockResolvedValueOnce({ id: 'service-account-user-1' }) // GET service-account-user

            const result = await adapter.provisionClient({ keycloakClientId: 'lef-svc-1', description: null })

            expect(result).toEqual({ subject: 'service-account-user-1', secret: 'a-secret' })
            expect(httpMock.request).toHaveBeenNthCalledWith(
                2,
                'POST',
                '/admin/realms/lead-email-finder/clients',
                expect.objectContaining({ clientId: 'lef-svc-1', serviceAccountsEnabled: true }),
                [201],
            )
            expect(httpMock.request).toHaveBeenNthCalledWith(
                6,
                'PUT',
                '/admin/realms/lead-email-finder/clients/internal-1/default-client-scopes/scope-1',
                undefined,
                [204],
            )
        })

        it('does not recreate the client or reassign the scope when both already exist', async () => {
            httpMock.request
                .mockResolvedValueOnce([{ id: 'internal-1', clientId: 'lef-svc-1' }]) // find-by-clientId: found
                .mockResolvedValueOnce([{ id: 'scope-1', name: 'lef-api-audience' }]) // client-scopes
                .mockResolvedValueOnce([{ id: 'scope-1' }]) // default-client-scopes: already assigned
                .mockResolvedValueOnce({ value: 'a-secret' })
                .mockResolvedValueOnce({ id: 'service-account-user-1' })

            await adapter.provisionClient({ keycloakClientId: 'lef-svc-1', description: null })

            expect(httpMock.request).not.toHaveBeenCalledWith(
                'POST',
                '/admin/realms/lead-email-finder/clients',
                expect.anything(),
                expect.anything(),
            )
            expect(httpMock.request).not.toHaveBeenCalledWith('PUT', expect.stringContaining('default-client-scopes'), expect.anything(), expect.anything())
        })

        it('throws when the audience scope cannot be found', async () => {
            httpMock.request
                .mockResolvedValueOnce([{ id: 'internal-1', clientId: 'lef-svc-1' }])
                .mockResolvedValueOnce([])

            await expect(adapter.provisionClient({ keycloakClientId: 'lef-svc-1', description: null })).rejects.toThrow(
                'lef-api-audience',
            )
        })
    })

    describe('rotateSecret', () => {
        it('regenerates and returns a new secret for an existing client', async () => {
            httpMock.request
                .mockResolvedValueOnce([{ id: 'internal-1', clientId: 'lef-svc-1' }])
                .mockResolvedValueOnce({ value: 'new-secret' })

            const secret = await adapter.rotateSecret('lef-svc-1')

            expect(secret).toBe('new-secret')
            expect(httpMock.request).toHaveBeenNthCalledWith(
                2,
                'POST',
                '/admin/realms/lead-email-finder/clients/internal-1/client-secret',
            )
        })

        it('throws when the client does not exist', async () => {
            httpMock.request.mockResolvedValueOnce([])

            await expect(adapter.rotateSecret('missing-client')).rejects.toThrow('missing-client')
        })
    })

    describe('deleteClient', () => {
        it('deletes an existing client', async () => {
            httpMock.request.mockResolvedValueOnce([{ id: 'internal-1', clientId: 'lef-svc-1' }]).mockResolvedValueOnce(undefined)

            await adapter.deleteClient('lef-svc-1')

            expect(httpMock.request).toHaveBeenNthCalledWith(
                2,
                'DELETE',
                '/admin/realms/lead-email-finder/clients/internal-1',
                undefined,
                [204, 404],
            )
        })

        it('is a no-op when the client is already gone', async () => {
            httpMock.request.mockResolvedValueOnce([])

            await adapter.deleteClient('already-gone')

            expect(httpMock.request).toHaveBeenCalledTimes(1)
        })
    })
})
