import { getRepositoryToken } from '@nestjs/typeorm'
import { Test, TestingModule } from '@nestjs/testing'
import { Repository } from 'typeorm'
import { Organization } from '@tuposoft/lead-email-finder/modules/identity'
import {
    LEGACY_BRIDGE_ORGANIZATION_NAME,
    LegacyBridgeOrganizationResolver,
} from './legacy-bridge-organization-resolver.service'

describe('LegacyBridgeOrganizationResolver', () => {
    let resolver: LegacyBridgeOrganizationResolver
    let repoMock: jest.Mocked<Pick<Repository<Organization>, 'findOneBy' | 'save' | 'create'>>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LegacyBridgeOrganizationResolver,
                {
                    provide: getRepositoryToken(Organization),
                    useValue: { findOneBy: jest.fn(), save: jest.fn(), create: jest.fn() },
                },
            ],
        }).compile()

        resolver = module.get(LegacyBridgeOrganizationResolver)
        repoMock = module.get(getRepositoryToken(Organization))
    })

    it('creates the bridge organization when none exists', async () => {
        repoMock.findOneBy.mockResolvedValue(null)
        repoMock.create.mockReturnValue({ name: LEGACY_BRIDGE_ORGANIZATION_NAME } as Organization)
        repoMock.save.mockResolvedValue({ id: 'created-id', name: LEGACY_BRIDGE_ORGANIZATION_NAME } as Organization)

        const organizationId = await resolver.resolve()

        expect(organizationId).toBe('created-id')
        expect(repoMock.create).toHaveBeenCalledWith({ name: LEGACY_BRIDGE_ORGANIZATION_NAME })
    })

    it('reuses an existing bridge organization', async () => {
        repoMock.findOneBy.mockResolvedValue({
            id: 'existing-id',
            name: LEGACY_BRIDGE_ORGANIZATION_NAME,
        } as Organization)

        const organizationId = await resolver.resolve()

        expect(organizationId).toBe('existing-id')
        expect(repoMock.save).not.toHaveBeenCalled()
    })

    it('resolves only once and caches the result across calls', async () => {
        repoMock.findOneBy.mockResolvedValue({
            id: 'existing-id',
            name: LEGACY_BRIDGE_ORGANIZATION_NAME,
        } as Organization)

        await resolver.resolve()
        await resolver.resolve()

        expect(repoMock.findOneBy).toHaveBeenCalledTimes(1)
    })
})
