import { Mapper } from '@automapper/core'
import { EmailPatternEnum } from '@tuposoft/lead-email-finder/common'
import { Repository } from 'typeorm'
import { EmailAlreadyExistsException } from './email-already-exists.exception'
import { EmailNotFoundException } from './email-not-found.exception'
import { EmailResponseDto } from './email-response.dto'
import { Email } from './email.entity'
import { EmailService } from './email.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const otherOrganizationId = '10000000-0000-4000-8000-000000000002'
const email = 'user@test.com'
const date = new Date('2026-08-31T00:00:00.000Z')

function emailEntity(overrides: Partial<Email> = {}): Email {
    return {
        organizationId,
        id: email,
        username: 'user',
        domain: 'test.com',
        exists: true,
        format: EmailPatternEnum.FDotLast,
        createdAt: date,
        updatedAt: date,
        ...overrides,
    }
}

function emailResponse(overrides: Partial<EmailResponseDto> = {}): EmailResponseDto {
    return {
        email,
        username: 'user',
        domain: 'test.com',
        exists: true,
        format: EmailPatternEnum.FDotLast,
        createdAt: date,
        updatedAt: date,
        ...overrides,
    }
}

describe('EmailService', () => {
    let emailRepo: jest.Mocked<Pick<Repository<Email>, 'find' | 'existsBy' | 'save' | 'create' | 'findOneBy'>>
    let mapper: jest.Mocked<Pick<Mapper, 'map' | 'mapArray'>>
    let service: EmailService

    beforeEach(() => {
        emailRepo = {
            find: jest.fn(),
            existsBy: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            findOneBy: jest.fn(),
        }
        mapper = { map: jest.fn(), mapArray: jest.fn() }
        service = new EmailService(emailRepo as unknown as Repository<Email>, mapper as unknown as Mapper)
    })

    it('creates a normalized address only within the requested organization', async () => {
        const entity = emailEntity()
        const response = emailResponse()
        emailRepo.existsBy.mockResolvedValue(false)
        emailRepo.create.mockReturnValue(entity)
        emailRepo.save.mockResolvedValue(entity)
        mapper.map.mockReturnValue(response as never)

        await expect(
            service.createEmail(organizationId, {
                email: 'User@Test.com',
                exists: true,
                format: EmailPatternEnum.FDotLast,
            }),
        ).resolves.toBe(response)

        expect(emailRepo.existsBy).toHaveBeenCalledWith({ organizationId, id: email })
        expect(emailRepo.create).toHaveBeenCalledWith({
            organizationId,
            id: email,
            username: 'user',
            domain: 'test.com',
            exists: true,
            format: EmailPatternEnum.FDotLast,
        })
    })

    it('checks duplicates with the composite organization and address identity', async () => {
        emailRepo.existsBy.mockResolvedValue(true)

        const error = await service
            .createEmail(otherOrganizationId, { email, exists: true })
            .catch((caughtError: unknown) => caughtError)

        expect(error).toBeInstanceOf(EmailAlreadyExistsException)
        expect((error as Error).message).toBe('Email already exists.')
        expect((error as Error).message).not.toContain(email)
        expect(emailRepo.existsBy).toHaveBeenCalledWith({ organizationId: otherOrganizationId, id: email })
        expect(emailRepo.save).not.toHaveBeenCalled()
    })

    it('lists only the requested organization', async () => {
        const entity = emailEntity()
        const response = emailResponse()
        emailRepo.find.mockResolvedValue([entity])
        mapper.mapArray.mockReturnValue([response] as never)

        await expect(service.getEmails(organizationId)).resolves.toEqual([response])

        expect(emailRepo.find).toHaveBeenCalledWith({ where: { organizationId } })
    })

    it('gets a normalized address only within the requested organization', async () => {
        const entity = emailEntity()
        const response = emailResponse()
        emailRepo.findOneBy.mockResolvedValue(entity)
        mapper.map.mockReturnValue(response as never)

        await expect(service.getEmail(organizationId, 'User@Test.com')).resolves.toBe(response)

        expect(emailRepo.findOneBy).toHaveBeenCalledWith({ organizationId, id: email })
    })

    it('conceals a missing or foreign address as not found', async () => {
        emailRepo.findOneBy.mockResolvedValue(null)

        const error = await service.getEmail(organizationId, email).catch((caughtError: unknown) => caughtError)

        expect(error).toBeInstanceOf(EmailNotFoundException)
        expect((error as Error).message).toBe('Email not found.')
        expect((error as Error).message).not.toContain(email)
        expect(emailRepo.findOneBy).toHaveBeenCalledWith({ organizationId, id: email })
        expect(mapper.map).not.toHaveBeenCalled()
    })

    it('strictly updates an owned address while preserving omitted fields', async () => {
        const entity = emailEntity()
        const saved = emailEntity({
            exists: false,
            lastVerificationId: '20000000-0000-4000-8000-000000000001',
        })
        const response = emailResponse({
            exists: false,
            lastVerificationId: saved.lastVerificationId,
        })
        emailRepo.findOneBy.mockResolvedValue(entity)
        emailRepo.save.mockResolvedValue(saved)
        mapper.map.mockReturnValue(response as never)

        await expect(
            service.updateEmail(organizationId, email, {
                exists: false,
                lastVerificationId: saved.lastVerificationId,
            }),
        ).resolves.toBe(response)

        expect(emailRepo.findOneBy).toHaveBeenCalledWith({ organizationId, id: email })
        expect(entity).toEqual(
            expect.objectContaining({
                format: EmailPatternEnum.FDotLast,
                exists: false,
                lastVerificationId: saved.lastVerificationId,
            }),
        )
    })

    it('does not upsert through the strict administrative update path', async () => {
        emailRepo.findOneBy.mockResolvedValue(null)

        await expect(service.updateEmail(organizationId, email, { exists: false })).rejects.toThrow(
            EmailNotFoundException,
        )

        expect(emailRepo.create).not.toHaveBeenCalled()
        expect(emailRepo.save).not.toHaveBeenCalled()
    })

    it('creates an organization-owned address through the verification-only upsert path', async () => {
        const verificationId = '20000000-0000-4000-8000-000000000001'
        const entity = emailEntity({ exists: false, lastVerificationId: verificationId })
        const response = emailResponse({ exists: false, lastVerificationId: verificationId })
        emailRepo.findOneBy.mockResolvedValue(null)
        emailRepo.create.mockReturnValue(entity)
        emailRepo.save.mockResolvedValue(entity)
        mapper.map.mockReturnValue(response as never)

        await expect(
            service.upsertEmail(organizationId, 'User@Test.com', {
                format: EmailPatternEnum.FDotLast,
                exists: false,
                lastVerificationId: verificationId,
            }),
        ).resolves.toBe(response)

        expect(emailRepo.findOneBy).toHaveBeenCalledWith({ organizationId, id: email })
        expect(emailRepo.create).toHaveBeenCalledWith({
            organizationId,
            id: email,
            username: 'user',
            domain: 'test.com',
            exists: null,
        })
        expect(entity.lastVerificationId).toBe(verificationId)
    })

    it('updates an owned verification cache without clearing its format', async () => {
        const verificationId = '20000000-0000-4000-8000-000000000001'
        const entity = emailEntity({ exists: true })
        const saved = emailEntity({ exists: null, lastVerificationId: verificationId })
        const response = emailResponse({ exists: null, lastVerificationId: verificationId })
        emailRepo.findOneBy.mockResolvedValue(entity)
        emailRepo.save.mockResolvedValue(saved)
        mapper.map.mockReturnValue(response as never)

        await expect(
            service.upsertEmail(organizationId, email, { exists: null, lastVerificationId: verificationId }),
        ).resolves.toBe(response)

        expect(entity).toEqual(
            expect.objectContaining({
                format: EmailPatternEnum.FDotLast,
                exists: null,
                lastVerificationId: verificationId,
            }),
        )
    })
})
