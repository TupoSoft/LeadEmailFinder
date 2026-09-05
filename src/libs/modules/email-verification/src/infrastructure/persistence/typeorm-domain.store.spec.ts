import { Repository } from 'typeorm'
import { TypeOrmDomainStore } from './typeorm-domain.store'
import { DomainPolicyEntity } from './typeorm/domain-policy.entity'

function entity(overrides: Partial<DomainPolicyEntity> = {}): DomainPolicyEntity {
    return Object.assign(new DomainPolicyEntity(), {
        id: 'example.com',
        isVerificationForbidden: false,
        catchAllEnabled: null,
        isFree: false,
        isDisposable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    })
}

function fakeRepository(
    overrides: Partial<jest.Mocked<Repository<DomainPolicyEntity>>> = {},
): jest.Mocked<Repository<DomainPolicyEntity>> {
    return { findOneBy: jest.fn().mockResolvedValue(null), ...overrides } as unknown as jest.Mocked<
        Repository<DomainPolicyEntity>
    >
}

describe('TypeOrmDomainStore', () => {
    it('returns null when no policy is stored for the name', async () => {
        const store = new TypeOrmDomainStore(fakeRepository())

        await expect(store.findByName('unknown.com')).resolves.toBeNull()
    })

    it('maps the stored entity to a domain policy record keyed by name', async () => {
        const repository = fakeRepository({ findOneBy: jest.fn().mockResolvedValue(entity({ isVerificationForbidden: true })) })
        const store = new TypeOrmDomainStore(repository)

        await expect(store.findByName('example.com')).resolves.toMatchObject({
            name: 'example.com',
            isVerificationForbidden: true,
        })
        expect(repository.findOneBy).toHaveBeenCalledWith({ id: 'example.com' })
    })
})
