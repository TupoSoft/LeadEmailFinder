import { DataSource } from 'typeorm'
import { KeycloakAdminPort } from './keycloak-admin-api'
import {
    assignPlatformAdminRole,
    ensureExternalIdentity,
    ensurePlatformOperatorMembership,
    ensurePlatformOperatorUser,
} from './platform-operator'

describe('ensurePlatformOperatorUser', () => {
    it('creates the user when absent, then resets the password', async () => {
        const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
        api.request
            .mockResolvedValueOnce([]) // find-by-email: not found
            .mockResolvedValueOnce(undefined) // POST create
            .mockResolvedValueOnce([{ id: 'user-1', email: 'platform-operator@lef.test' }]) // find-by-email: found
            .mockResolvedValueOnce(undefined) // PUT reset-password

        const result = await ensurePlatformOperatorUser(api, 'platform-operator@lef.test', 'a-password')

        expect(result).toEqual({ subject: 'user-1' })
        expect(api.request).toHaveBeenNthCalledWith(
            2,
            'POST',
            expect.stringContaining('/users'),
            expect.objectContaining({ email: 'platform-operator@lef.test' }),
            [201],
        )
        expect(api.request).toHaveBeenNthCalledWith(
            4,
            'PUT',
            expect.stringContaining('/reset-password'),
            { type: 'password', value: 'a-password', temporary: false },
            [204],
        )
    })

    it('resets the password without recreating an existing user', async () => {
        const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
        api.request
            .mockResolvedValueOnce([{ id: 'user-1', email: 'platform-operator@lef.test' }])
            .mockResolvedValueOnce(undefined)

        const result = await ensurePlatformOperatorUser(api, 'platform-operator@lef.test', 'a-password')

        expect(result).toEqual({ subject: 'user-1' })
        expect(api.request).not.toHaveBeenCalledWith('POST', expect.stringContaining('/users'), expect.anything(), expect.anything())
    })
})

describe('assignPlatformAdminRole', () => {
    it('assigns the platform_admin realm role', async () => {
        const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
        api.request.mockResolvedValueOnce({ id: 'role-1', name: 'platform_admin' }).mockResolvedValueOnce(undefined)

        await assignPlatformAdminRole(api, 'user-1')

        expect(api.request).toHaveBeenNthCalledWith(1, 'GET', expect.stringContaining('/roles/platform_admin'))
        expect(api.request).toHaveBeenNthCalledWith(
            2,
            'POST',
            expect.stringContaining('/users/user-1/role-mappings/realm'),
            [{ id: 'role-1', name: 'platform_admin' }],
            [204],
        )
    })
})

describe('ensureExternalIdentity', () => {
    it('upserts a row keyed by issuer and subject', async () => {
        const query = jest.fn().mockResolvedValue([{ id: 'identity-1' }])
        const dataSource = { query } as unknown as DataSource

        const id = await ensureExternalIdentity(dataSource, 'https://issuer', 'user-1', 'platform-operator@lef.test')

        expect(id).toBe('identity-1')
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('ON CONFLICT (issuer, subject) DO UPDATE'),
            ['https://issuer', 'user-1', 'platform-operator@lef.test'],
        )
    })
})

describe('ensurePlatformOperatorMembership', () => {
    it('upserts an active platform_admin membership', async () => {
        const query = jest.fn().mockResolvedValue(undefined)
        const dataSource = { query } as unknown as DataSource

        await ensurePlatformOperatorMembership(dataSource, 'org-1', 'identity-1')

        expect(query).toHaveBeenCalledWith(expect.stringContaining("role = 'platform_admin'"), ['org-1', 'identity-1'])
    })
})
