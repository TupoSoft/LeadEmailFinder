import { Repository } from 'typeorm'
import { ServiceCredential } from './service-credential.entity'
import { TypeOrmServiceCredentialDirectory } from './typeorm-service-credential-directory'

describe('TypeOrmServiceCredentialDirectory', () => {
    let repoMock: jest.Mocked<Pick<Repository<ServiceCredential>, 'find' | 'findOneBy'>>
    let directory: TypeOrmServiceCredentialDirectory

    const credential: ServiceCredential = {
        id: 'sc-1',
        organizationId: 'org-1',
        issuer: 'https://issuer',
        subject: 'service-account-1',
        keycloakClientId: 'lef-svc-1',
        description: 'CI integration',
        permissions: ['verification:run'],
        status: 'disabled',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    } as ServiceCredential

    beforeEach(() => {
        repoMock = { find: jest.fn(), findOneBy: jest.fn() }
        directory = new TypeOrmServiceCredentialDirectory(repoMock as unknown as Repository<ServiceCredential>)
    })

    it('lists every organization credential newest first, including disabled credentials', async () => {
        repoMock.find.mockResolvedValueOnce([credential])

        const result = await directory.listForOrganization('org-1')

        expect(repoMock.find).toHaveBeenCalledWith({
            where: { organizationId: 'org-1' },
            order: { createdAt: 'DESC', id: 'DESC' },
        })
        expect(result).toEqual([
            {
                id: 'sc-1',
                organizationId: 'org-1',
                issuer: 'https://issuer',
                subject: 'service-account-1',
                keycloakClientId: 'lef-svc-1',
                description: 'CI integration',
                permissions: ['verification:run'],
                status: 'disabled',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-02T00:00:00.000Z'),
            },
        ])
        expect(result[0]).not.toBe(credential)
        expect(result[0].permissions).not.toBe(credential.permissions)
    })

    it('uses descending IDs to break equal creation timestamps and preserves the returned order', async () => {
        const equalTimestampRows = [
            { ...credential, id: 'cccccccc-cccc-4ccc-accc-cccccccccccc', status: 'active' as const },
            { ...credential, id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' },
        ]
        repoMock.find.mockResolvedValueOnce(equalTimestampRows)

        const result = await directory.listForOrganization('org-1')

        expect(repoMock.find).toHaveBeenCalledWith({
            where: { organizationId: 'org-1' },
            order: { createdAt: 'DESC', id: 'DESC' },
        })
        expect(result.map(row => row.id)).toEqual(equalTimestampRows.map(row => row.id))
        expect(result.map(row => row.status)).toEqual(['active', 'disabled'])
    })

    it('finds a credential by its id only within the requested organization', async () => {
        repoMock.findOneBy.mockResolvedValueOnce(credential)

        const result = await directory.findByIdForOrganization('sc-1', 'org-1')

        expect(repoMock.findOneBy).toHaveBeenCalledWith({ id: 'sc-1', organizationId: 'org-1' })
        expect(result).toEqual(expect.objectContaining({ id: 'sc-1', organizationId: 'org-1' }))
    })

    it('returns undefined when the scoped credential does not exist', async () => {
        repoMock.findOneBy.mockResolvedValueOnce(null)

        await expect(directory.findByIdForOrganization('missing', 'org-1')).resolves.toBeUndefined()
    })
})
