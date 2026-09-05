import { Repository } from 'typeorm'
import { TypeOrmVerificationStore } from './typeorm-verification.store'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'

const ORGANIZATION_ID = 'org-1'

function fakeRepository(
    overrides: Partial<jest.Mocked<Repository<EmailVerificationEntity>>> = {},
): jest.Mocked<Repository<EmailVerificationEntity>> {
    return {
        create: jest.fn().mockImplementation((attrs: Partial<EmailVerificationEntity>) =>
            Object.assign(new EmailVerificationEntity(), attrs),
        ),
        save: jest.fn().mockImplementation((entity: EmailVerificationEntity) =>
            Promise.resolve(Object.assign(entity, { id: 'verification-1', createdAt: new Date() })),
        ),
        ...overrides,
    } as unknown as jest.Mocked<Repository<EmailVerificationEntity>>
}

describe('TypeOrmVerificationStore', () => {
    it('creates a new record scoped to the organization and returns it with a generated id', async () => {
        const repository = fakeRepository()
        const store = new TypeOrmVerificationStore(repository)

        const result = await store.create(ORGANIZATION_ID, {
            email: 'person@example.com',
            domain: 'example.com',
            localPart: 'person',
            exists: true,
            catchAll: false,
            reason: 'accepted_email' as never,
            sources: [],
        })

        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: ORGANIZATION_ID, email: 'person@example.com' }),
        )
        expect(result.id).toBe('verification-1')
        expect(result.organizationId).toBe(ORGANIZATION_ID)
    })
})
