import { DataSource } from 'typeorm'
import { KeycloakAdminPort } from './keycloak-admin-api'
import {
    ALL_PERMISSIONS,
    ensurePlatformOrganization,
    PLATFORM_ORGANIZATION_NAME,
    resolveServiceAccountSubject,
    smtpDevIssuer,
    upsertServiceCredential,
} from './bootstrap-service-credential'

describe('smtpDevIssuer', () => {
    it('replaces the host with the container-internal Keycloak service name', () => {
        expect(smtpDevIssuer('http://localhost:58080/realms/lead-email-finder')).toBe(
            'http://keycloak:8080/realms/lead-email-finder',
        )
    })
})

describe('resolveServiceAccountSubject', () => {
    it('resolves the service-account user id for a client', async () => {
        const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
        api.request
            .mockResolvedValueOnce([{ id: 'internal-1', clientId: 'lef-development-service' }])
            .mockResolvedValueOnce({ id: 'service-account-1' })

        const subject = await resolveServiceAccountSubject(api, 'lef-development-service')

        expect(subject).toBe('service-account-1')
    })

    it('throws when the client does not exist', async () => {
        const api: jest.Mocked<KeycloakAdminPort> = { request: jest.fn(), requestOrUndefined: jest.fn() }
        api.request.mockResolvedValueOnce([])

        await expect(resolveServiceAccountSubject(api, 'missing-client')).rejects.toThrow('missing-client')
    })
})

describe('ensurePlatformOrganization', () => {
    it('creates the organization once and reuses it on retry', async () => {
        let existing: Array<{ id: string }> = []
        const query = jest.fn((sql: string) => {
            if (sql.startsWith('SELECT')) {
                return Promise.resolve(existing)
            }
            existing = [{ id: 'org-1' }]
            return Promise.resolve([{ id: 'org-1' }])
        })
        const dataSource = { query } as unknown as DataSource

        const first = await ensurePlatformOrganization(dataSource)
        const second = await ensurePlatformOrganization(dataSource)

        expect(first).toBe('org-1')
        expect(second).toBe('org-1')
        expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO organizations'), [
            PLATFORM_ORGANIZATION_NAME,
        ])
    })
})

describe('upsertServiceCredential', () => {
    it('upserts a row keyed by issuer and subject with every permission', async () => {
        const query = jest.fn().mockResolvedValue(undefined)
        const dataSource = { query } as unknown as DataSource

        await upsertServiceCredential(dataSource, 'org-1', 'service-account-1', {
            issuer: 'http://localhost:58080/realms/lead-email-finder',
            keycloakClientId: 'lef-development-service',
        })

        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('ON CONFLICT (issuer, subject) DO UPDATE'),
            expect.arrayContaining([
                'org-1',
                'http://localhost:58080/realms/lead-email-finder',
                'service-account-1',
                'lef-development-service',
                expect.any(String),
                ALL_PERMISSIONS,
            ]),
        )
    })
})
