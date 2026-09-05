import { Repository } from 'typeorm'
import { TypeOrmSmtpVerificationStore } from './typeorm-smtp-verification.store'
import { SmtpVerificationEntity } from './typeorm/smtp-verification.entity'

const ORGANIZATION_ID = 'org-1'

function entity(overrides: Partial<SmtpVerificationEntity> = {}): SmtpVerificationEntity {
    return Object.assign(new SmtpVerificationEntity(), {
        organizationId: ORGANIZATION_ID,
        id: 'person@example.com',
        reason: 'accepted_email',
        exists: true,
        secureTransport: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    })
}

function fakeRepository(
    overrides: Partial<jest.Mocked<Repository<SmtpVerificationEntity>>> = {},
): jest.Mocked<Repository<SmtpVerificationEntity>> {
    return {
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((attrs: Partial<SmtpVerificationEntity>) =>
            Object.assign(new SmtpVerificationEntity(), attrs),
        ),
        save: jest.fn().mockImplementation((saved: SmtpVerificationEntity) => Promise.resolve(saved)),
        ...overrides,
    } as unknown as jest.Mocked<Repository<SmtpVerificationEntity>>
}

describe('TypeOrmSmtpVerificationStore', () => {
    it('returns null when no cache entry exists', async () => {
        const store = new TypeOrmSmtpVerificationStore(fakeRepository())

        await expect(store.findByAddress(ORGANIZATION_ID, 'missing@example.com')).resolves.toBeNull()
    })

    it('maps a found entity to the domain record', async () => {
        const repository = fakeRepository({ findOneBy: jest.fn().mockResolvedValue(entity()) })
        const store = new TypeOrmSmtpVerificationStore(repository)

        await expect(store.findByAddress(ORGANIZATION_ID, 'person@example.com')).resolves.toMatchObject({
            organizationId: ORGANIZATION_ID,
            reason: 'accepted_email',
            secureTransport: true,
        })
    })

    it('creates a new cache row on upsert when none exists', async () => {
        const repository = fakeRepository()
        const store = new TypeOrmSmtpVerificationStore(repository)

        await store.upsert(ORGANIZATION_ID, 'fresh@example.com', {
            reason: 'no_mx_records',
            exists: false,
            secureTransport: false,
        })

        expect(repository.create).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, id: 'fresh@example.com' })
        expect(repository.save).toHaveBeenCalledWith(
            expect.objectContaining({ reason: 'no_mx_records', exists: false, secureTransport: false }),
        )
    })

    it('overwrites the existing cache row on upsert when one exists', async () => {
        const repository = fakeRepository({ findOneBy: jest.fn().mockResolvedValue(entity({ secureTransport: false })) })
        const store = new TypeOrmSmtpVerificationStore(repository)

        await store.upsert(ORGANIZATION_ID, 'person@example.com', {
            reason: 'accepted_email',
            exists: true,
            secureTransport: true,
        })

        expect(repository.create).not.toHaveBeenCalled()
        expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ secureTransport: true }))
    })
})
