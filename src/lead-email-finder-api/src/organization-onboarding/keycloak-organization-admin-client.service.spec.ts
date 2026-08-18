import { KeycloakAdminHttpClient } from './keycloak-admin-http-client.service'
import { KeycloakAdminHttpConfiguration } from './keycloak-admin-http-configuration'
import { KeycloakOrganizationAdminClient } from './keycloak-organization-admin-client.service'

const configuration: KeycloakAdminHttpConfiguration = {
    baseUrl: 'http://localhost:58080',
    realm: 'lead-email-finder',
    clientId: 'lef-org-admin-service',
    clientSecret: 'secret',
}

describe('KeycloakOrganizationAdminClient', () => {
    let httpMock: jest.Mocked<Pick<KeycloakAdminHttpClient, 'request' | 'requestOrUndefined'>>
    let client: KeycloakOrganizationAdminClient

    beforeEach(() => {
        httpMock = { request: jest.fn(), requestOrUndefined: jest.fn() }
        client = new KeycloakOrganizationAdminClient(httpMock as unknown as KeycloakAdminHttpClient, configuration)
    })

    describe('ensureUser', () => {
        it('resets the password of an existing user without creating a new one', async () => {
            httpMock.request.mockResolvedValueOnce([{ id: 'existing-user-1', email: 'person@example.test' }])
            httpMock.request.mockResolvedValueOnce(undefined)

            const result = await client.ensureUser({ email: 'person@example.test', password: 'password12345' })

            expect(result).toEqual({ subject: 'existing-user-1' })
            expect(httpMock.request).toHaveBeenCalledWith(
                'PUT',
                '/admin/realms/lead-email-finder/users/existing-user-1/reset-password',
                { type: 'password', value: 'password12345', temporary: false },
                [204],
            )
            expect(httpMock.request).toHaveBeenCalledTimes(2)
        })

        it('creates the user first when none exists, then resets the password', async () => {
            httpMock.request.mockResolvedValueOnce([])
            httpMock.request.mockResolvedValueOnce(undefined)
            httpMock.request.mockResolvedValueOnce([{ id: 'new-user-1', email: 'person@example.test' }])
            httpMock.request.mockResolvedValueOnce(undefined)

            const result = await client.ensureUser({ email: 'person@example.test', password: 'password12345' })

            expect(result).toEqual({ subject: 'new-user-1' })
            expect(httpMock.request).toHaveBeenNthCalledWith(
                2,
                'POST',
                '/admin/realms/lead-email-finder/users',
                expect.objectContaining({ username: 'person@example.test', email: 'person@example.test' }),
                [201],
            )
        })

        it('throws when the created user is still not findable by email', async () => {
            httpMock.request.mockResolvedValueOnce([])
            httpMock.request.mockResolvedValueOnce(undefined)
            httpMock.request.mockResolvedValueOnce([])

            await expect(client.ensureUser({ email: 'person@example.test', password: 'password12345' })).rejects.toThrow(
                'not visible after creation',
            )
        })
    })

    describe('assignRealmRole', () => {
        it('looks up the role representation then assigns it to the subject', async () => {
            httpMock.request.mockResolvedValueOnce({ id: 'role-id-1', name: 'owner' })
            httpMock.request.mockResolvedValueOnce(undefined)

            await client.assignRealmRole('subject-1', 'owner')

            expect(httpMock.request).toHaveBeenNthCalledWith(1, 'GET', '/admin/realms/lead-email-finder/roles/owner')
            expect(httpMock.request).toHaveBeenNthCalledWith(
                2,
                'POST',
                '/admin/realms/lead-email-finder/users/subject-1/role-mappings/realm',
                [{ id: 'role-id-1', name: 'owner' }],
                [204],
            )
        })
    })
})
