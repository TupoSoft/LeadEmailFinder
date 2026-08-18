import { KeycloakAdminHttpClient } from './keycloak-admin-http-client.service'
import { KeycloakAdminHttpConfiguration } from './keycloak-admin-http-configuration'

const configuration: KeycloakAdminHttpConfiguration = {
    baseUrl: 'http://localhost:58080',
    realm: 'lead-email-finder',
    clientId: 'lef-org-admin-service',
    clientSecret: 'secret',
}

describe('KeycloakAdminHttpClient', () => {
    let client: KeycloakAdminHttpClient
    let fetchMock: jest.Mock

    beforeEach(() => {
        client = new KeycloakAdminHttpClient(configuration)
        fetchMock = jest.fn()
        global.fetch = fetchMock as never
    })

    function mockTokenResponse(expiresIn = 60): void {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ access_token: 'admin-token', expires_in: expiresIn }),
        })
    }

    describe('request', () => {
        it('fetches a client-credentials token before the first call and reuses it on the next call', async () => {
            mockTokenResponse()
            fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => '10' }, text: () => Promise.resolve('{"id":"1"}') })
            fetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => '10' }, text: () => Promise.resolve('{"id":"1"}') })

            await client.request('GET', '/admin/realms/lead-email-finder/users/1')
            await client.request('GET', '/admin/realms/lead-email-finder/users/1')

            const tokenCalls = fetchMock.mock.calls.filter((call: unknown[]) =>
                (call[0] as string).includes('/protocol/openid-connect/token'),
            )
            expect(tokenCalls).toHaveLength(1)
        })

        it('refreshes the token once it is close to expiry', async () => {
            mockTokenResponse(0)
            fetchMock.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => '0' }, text: () => Promise.resolve('') })
            mockTokenResponse(60)
            fetchMock.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => '0' }, text: () => Promise.resolve('') })

            await client.request('POST', '/admin/realms/lead-email-finder/users', {}, [204])
            await client.request('POST', '/admin/realms/lead-email-finder/users', {}, [204])

            const tokenCalls = fetchMock.mock.calls.filter((call: unknown[]) =>
                (call[0] as string).includes('/protocol/openid-connect/token'),
            )
            expect(tokenCalls).toHaveLength(2)
        })

        it('throws when the authentication request fails', async () => {
            fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })

            await expect(client.request('GET', '/admin/realms/lead-email-finder/users/1')).rejects.toThrow(
                'authentication failed',
            )
        })

        it('throws with the response body when the status is not accepted', async () => {
            mockTokenResponse()
            fetchMock.mockResolvedValueOnce({ ok: false, status: 409, text: () => Promise.resolve('conflict') })

            await expect(
                client.request('POST', '/admin/realms/lead-email-finder/users', {}, [201]),
            ).rejects.toThrow('409')
        })

        it('returns undefined for a 204 response', async () => {
            mockTokenResponse()
            fetchMock.mockResolvedValueOnce({ ok: true, status: 204, headers: { get: () => null }, text: () => Promise.resolve('') })

            await expect(client.request('DELETE', '/admin/realms/lead-email-finder/users/1', undefined, [204])).resolves.toBeUndefined()
        })
    })

    describe('requestOrUndefined', () => {
        it('returns undefined on a 404', async () => {
            mockTokenResponse()
            fetchMock.mockResolvedValueOnce({ status: 404 })

            await expect(client.requestOrUndefined('/admin/realms/lead-email-finder/users/missing')).resolves.toBeUndefined()
        })

        it('throws on a non-ok, non-404 response', async () => {
            mockTokenResponse()
            fetchMock.mockResolvedValueOnce({ status: 500, ok: false, text: () => Promise.resolve('boom') })

            await expect(client.requestOrUndefined('/admin/realms/lead-email-finder/users/1')).rejects.toThrow('500')
        })

        it('returns the parsed JSON body on success', async () => {
            mockTokenResponse()
            fetchMock.mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve({ id: '1' }) })

            await expect(client.requestOrUndefined('/admin/realms/lead-email-finder/users/1')).resolves.toEqual({ id: '1' })
        })
    })
})
