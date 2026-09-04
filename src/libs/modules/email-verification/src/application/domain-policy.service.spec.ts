import { DomainPolicy } from '../domain/domain-policy'
import { DomainNotFoundError } from '../domain/errors'
import { DomainPolicyService } from './domain-policy.service'
import { DomainStore } from './ports/domain-store'

function domainPolicy(overrides: Partial<DomainPolicy> = {}): DomainPolicy {
    return {
        name: 'example.com',
        isVerificationForbidden: false,
        catchAllEnabled: null,
        isFree: false,
        isDisposable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

function fakeStore(policy: DomainPolicy | null): DomainStore {
    return { findByName: jest.fn().mockResolvedValue(policy) }
}

describe('DomainPolicyService', () => {
    describe('getDomain', () => {
        it('returns the stored policy when found', async () => {
            const policy = domainPolicy()
            const service = new DomainPolicyService(fakeStore(policy))

            await expect(service.getDomain('example.com')).resolves.toEqual(policy)
        })

        it('throws DomainNotFoundError when no policy is stored', async () => {
            const service = new DomainPolicyService(fakeStore(null))

            await expect(service.getDomain('missing.com')).rejects.toThrow(DomainNotFoundError)
        })
    })

    describe('isVerificationAllowed', () => {
        it('allows verification when no policy record exists', async () => {
            const service = new DomainPolicyService(fakeStore(null))

            await expect(service.isVerificationAllowed('unknown.com')).resolves.toBe(true)
        })

        it('allows verification when the stored policy does not forbid it', async () => {
            const service = new DomainPolicyService(fakeStore(domainPolicy({ isVerificationForbidden: false })))

            await expect(service.isVerificationAllowed('example.com')).resolves.toBe(true)
        })

        it('forbids verification when the stored policy forbids it', async () => {
            const service = new DomainPolicyService(fakeStore(domainPolicy({ isVerificationForbidden: true })))

            await expect(service.isVerificationAllowed('blocked.com')).resolves.toBe(false)
        })
    })
})
