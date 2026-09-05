import { Repository } from 'typeorm'
import { TypeOrmEmailStore } from './typeorm-email.store'
import { EmailEntity } from './typeorm/email.entity'

const ORGANIZATION_ID = 'org-1'

function entity(overrides: Partial<EmailEntity> = {}): EmailEntity {
    return Object.assign(new EmailEntity(), {
        organizationId: ORGANIZATION_ID,
        id: 'person@example.com',
        username: 'person',
        domain: 'example.com',
        exists: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    })
}

function fakeRepository(overrides: Partial<jest.Mocked<Repository<EmailEntity>>> = {}): jest.Mocked<Repository<EmailEntity>> {
    return {
        findOneBy: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((attrs: Partial<EmailEntity>) => Object.assign(new EmailEntity(), attrs)),
        save: jest.fn().mockImplementation((saved: EmailEntity) => Promise.resolve(saved)),
        ...overrides,
    } as unknown as jest.Mocked<Repository<EmailEntity>>
}

describe('TypeOrmEmailStore', () => {
    it('returns null when the address is not stored', async () => {
        const store = new TypeOrmEmailStore(fakeRepository())

        await expect(store.findByAddress(ORGANIZATION_ID, 'missing@example.com')).resolves.toBeNull()
    })

    it('maps a found entity to the domain record', async () => {
        const repository = fakeRepository({ findOneBy: jest.fn().mockResolvedValue(entity()) })
        const store = new TypeOrmEmailStore(repository)

        await expect(store.findByAddress(ORGANIZATION_ID, 'person@example.com')).resolves.toMatchObject({
            organizationId: ORGANIZATION_ID,
            id: 'person@example.com',
            username: 'person',
            domain: 'example.com',
        })
    })

    it('lists every record for an organization', async () => {
        const repository = fakeRepository({ find: jest.fn().mockResolvedValue([entity()]) })
        const store = new TypeOrmEmailStore(repository)

        const result = await store.findAllForOrganization(ORGANIZATION_ID)

        expect(repository.find).toHaveBeenCalledWith({ where: { organizationId: ORGANIZATION_ID } })
        expect(result).toHaveLength(1)
    })

    it('derives username and domain from the address on create', async () => {
        const repository = fakeRepository()
        const store = new TypeOrmEmailStore(repository)

        await store.create(ORGANIZATION_ID, { id: 'new@example.com', exists: null })

        expect(repository.create).toHaveBeenCalledWith({
            organizationId: ORGANIZATION_ID,
            id: 'new@example.com',
            username: 'new',
            domain: 'example.com',
            exists: null,
            format: undefined,
        })
    })

    it('returns null from update when the record does not exist', async () => {
        const store = new TypeOrmEmailStore(fakeRepository())

        await expect(store.update(ORGANIZATION_ID, 'missing@example.com', { exists: true })).resolves.toBeNull()
    })

    it('applies partial changes on update without touching untouched fields', async () => {
        const repository = fakeRepository({ findOneBy: jest.fn().mockResolvedValue(entity({ exists: null })) })
        const store = new TypeOrmEmailStore(repository)

        const result = await store.update(ORGANIZATION_ID, 'person@example.com', { exists: true })

        expect(result).toMatchObject({ exists: true, username: 'person' })
    })

    it('creates a new record on upsert when none exists', async () => {
        const repository = fakeRepository()
        const store = new TypeOrmEmailStore(repository)

        await store.upsert(ORGANIZATION_ID, 'fresh@example.com', { exists: false })

        expect(repository.create).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: ORGANIZATION_ID, id: 'fresh@example.com', username: 'fresh', domain: 'example.com' }),
        )
    })

    it('updates the existing record on upsert when one exists', async () => {
        const repository = fakeRepository({ findOneBy: jest.fn().mockResolvedValue(entity()) })
        const store = new TypeOrmEmailStore(repository)

        await store.upsert(ORGANIZATION_ID, 'person@example.com', { lastVerificationId: 'v-1' })

        expect(repository.create).not.toHaveBeenCalled()
        expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ lastVerificationId: 'v-1' }))
    })
})
