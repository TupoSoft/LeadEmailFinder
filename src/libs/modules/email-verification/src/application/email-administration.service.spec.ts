import { Email } from '../domain/email'
import { EmailAlreadyExistsError, EmailNotFoundError } from '../domain/errors'
import { EmailAdministrationService } from './email-administration.service'
import { EmailStore } from './ports/email-store'

const ORGANIZATION_ID = 'org-1'

function email(overrides: Partial<Email> = {}): Email {
    return {
        organizationId: ORGANIZATION_ID,
        id: 'person@example.com',
        username: 'person',
        domain: 'example.com',
        exists: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

function fakeStore(overrides: Partial<jest.Mocked<EmailStore>> = {}): jest.Mocked<EmailStore> {
    return {
        findByAddress: jest.fn().mockResolvedValue(null),
        findAllForOrganization: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((organizationId, { id, exists, format }) =>
            Promise.resolve(email({ organizationId, id, exists, format })),
        ),
        update: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation((organizationId, address) => Promise.resolve(email({ organizationId, id: address }))),
        ...overrides,
    }
}

describe('EmailAdministrationService', () => {
    describe('createEmail', () => {
        it('normalizes the address and creates a new record', async () => {
            const store = fakeStore()
            const service = new EmailAdministrationService(store)

            const result = await service.createEmail(ORGANIZATION_ID, { email: 'Person@Example.com', exists: null })

            expect(store.findByAddress).toHaveBeenCalledWith(ORGANIZATION_ID, 'person@example.com')
            expect(store.create).toHaveBeenCalledWith(ORGANIZATION_ID, {
                id: 'person@example.com',
                exists: null,
                format: undefined,
            })
            expect(result.id).toBe('person@example.com')
        })

        it('throws EmailAlreadyExistsError when the address is already stored', async () => {
            const store = fakeStore({ findByAddress: jest.fn().mockResolvedValue(email()) })
            const service = new EmailAdministrationService(store)

            await expect(service.createEmail(ORGANIZATION_ID, { email: 'person@example.com', exists: null })).rejects.toThrow(
                EmailAlreadyExistsError,
            )
            expect(store.create).not.toHaveBeenCalled()
        })
    })

    describe('getEmail', () => {
        it('returns the stored record when found', async () => {
            const stored = email()
            const store = fakeStore({ findByAddress: jest.fn().mockResolvedValue(stored) })
            const service = new EmailAdministrationService(store)

            await expect(service.getEmail(ORGANIZATION_ID, 'person@example.com')).resolves.toEqual(stored)
        })

        it('throws EmailNotFoundError when missing', async () => {
            const service = new EmailAdministrationService(fakeStore())

            await expect(service.getEmail(ORGANIZATION_ID, 'missing@example.com')).rejects.toThrow(EmailNotFoundError)
        })
    })

    describe('getEmails', () => {
        it('lists every record for the organization', async () => {
            const stored = [email()]
            const store = fakeStore({ findAllForOrganization: jest.fn().mockResolvedValue(stored) })
            const service = new EmailAdministrationService(store)

            await expect(service.getEmails(ORGANIZATION_ID)).resolves.toEqual(stored)
        })
    })

    describe('updateEmail', () => {
        it('applies changes to an existing record', async () => {
            const updated = email({ exists: true })
            const store = fakeStore({ update: jest.fn().mockResolvedValue(updated) })
            const service = new EmailAdministrationService(store)

            const result = await service.updateEmail(ORGANIZATION_ID, 'person@example.com', { exists: true })

            expect(store.update).toHaveBeenCalledWith(ORGANIZATION_ID, 'person@example.com', { exists: true })
            expect(result).toEqual(updated)
        })

        it('throws EmailNotFoundError when the record does not exist', async () => {
            const service = new EmailAdministrationService(fakeStore())

            await expect(
                service.updateEmail(ORGANIZATION_ID, 'missing@example.com', { exists: true }),
            ).rejects.toThrow(EmailNotFoundError)
        })
    })

    describe('upsertEmail', () => {
        it('delegates directly to the store without a conflict check', async () => {
            const store = fakeStore()
            const service = new EmailAdministrationService(store)

            await service.upsertEmail(ORGANIZATION_ID, 'Person@Example.com', { exists: false })

            expect(store.findByAddress).not.toHaveBeenCalled()
            expect(store.upsert).toHaveBeenCalledWith(ORGANIZATION_ID, 'person@example.com', { exists: false })
        })
    })
})
