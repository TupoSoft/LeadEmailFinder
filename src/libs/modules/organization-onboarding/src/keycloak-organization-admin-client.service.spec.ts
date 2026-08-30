import { KeycloakAdminHttp } from '@tuposoft/lead-email-finder/keycloak-admin-http'
import { KeycloakOrganizationAdminClient } from './keycloak-organization-admin-client.service'

describe('KeycloakOrganizationAdminClient', () => {
    let httpMock: jest.Mocked<KeycloakAdminHttp>
    let client: KeycloakOrganizationAdminClient

    beforeEach(() => {
        httpMock = { requestRealm: jest.fn() }
        client = new KeycloakOrganizationAdminClient(httpMock)
    })

    describe('ensureUser', () => {
        it('returns an existing user without changing credentials or creating a new one', async () => {
            httpMock.requestRealm.mockResolvedValueOnce([{ id: 'existing-user-1', email: 'person@example.test' }])

            const result = await client.ensureUser({ email: 'person@example.test', password: 'password12345' })

            expect(result).toEqual({ subject: 'existing-user-1', created: false })
            expect(httpMock.requestRealm).toHaveBeenCalledTimes(1)
        })

        it('creates a missing user with its initial non-temporary password', async () => {
            httpMock.requestRealm.mockResolvedValueOnce([])
            httpMock.requestRealm.mockResolvedValueOnce(undefined)
            httpMock.requestRealm.mockResolvedValueOnce([{ id: 'new-user-1', email: 'person@example.test' }])

            const result = await client.ensureUser({ email: 'person@example.test', password: 'password12345' })

            expect(result).toEqual({ subject: 'new-user-1', created: true })
            expect(httpMock.requestRealm).toHaveBeenNthCalledWith(
                2,
                'POST',
                '/users',
                expect.objectContaining({
                    username: 'person@example.test',
                    email: 'person@example.test',
                    firstName: 'Invited',
                    lastName: 'User',
                    credentials: [{ type: 'password', value: 'password12345', temporary: false }],
                }),
                [201],
            )
            expect(httpMock.requestRealm).toHaveBeenCalledTimes(3)
        })

        it('throws when the created user is still not findable by email', async () => {
            httpMock.requestRealm.mockResolvedValueOnce([])
            httpMock.requestRealm.mockResolvedValueOnce(undefined)
            httpMock.requestRealm.mockResolvedValueOnce([])

            await expect(
                client.ensureUser({ email: 'person@example.test', password: 'password12345' }),
            ).rejects.toThrow('not visible after creation')
        })
    })

    describe('assignRealmRole', () => {
        it('looks up the role representation then assigns it to the subject', async () => {
            httpMock.requestRealm.mockResolvedValueOnce({ id: 'role-id-1', name: 'owner' })
            httpMock.requestRealm.mockResolvedValueOnce(undefined)

            await client.assignRealmRole('subject-1', 'owner')

            expect(httpMock.requestRealm).toHaveBeenNthCalledWith(1, 'GET', '/roles/owner')
            expect(httpMock.requestRealm).toHaveBeenNthCalledWith(
                2,
                'POST',
                '/users/subject-1/role-mappings/realm',
                [{ id: 'role-id-1', name: 'owner' }],
                [204],
            )
        })
    })
})
