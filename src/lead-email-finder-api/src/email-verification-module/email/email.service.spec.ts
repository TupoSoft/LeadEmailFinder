import { Test } from '@nestjs/testing'
import { EmailService } from './email.service'
import { Email } from './email.entity'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Mapper } from '@automapper/core'
import { getMapperToken } from '@automapper/nestjs'
import { EmailPatternEnum, ICreateEmailRequestDto, IUpdateEmailRequestDto } from '@tuposoft/lead-email-finder/common'
import { when } from 'jest-when'
import { Repository } from 'typeorm'
import { EmailResponseDto } from './email-response.dto'
import { EmailAlreadyExistsException } from './email-already-exists.exception'
import { EmailNotFoundException } from './email-not-found.exception'

const now = Date.now()
const date = new Date(now)
jest.useFakeTimers({ now })

const mockedEmailRepo: jest.Mocked<
    Pick<Repository<Email>, 'find' | 'existsBy' | 'save' | 'create' | 'findOneBy'>
> = {
    find: jest.fn(),
    existsBy: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    findOneBy: jest.fn(),
}

const mockedMapper: jest.Mocked<Pick<Mapper, 'map' | 'mapArray'>> = {
    map: jest.fn(),
    mapArray: jest.fn(),
}

const username = 'user'
const domain = 'test.com'
const email = `${username}@${domain}`

const emailEntity: Email = {
    id: email,
    exists: true,
    format: EmailPatternEnum.FDotLast,
    domain,
    username,
    createdAt: date,
    updatedAt: date,
    lastVerificationId: undefined,
    lastVerifiedAt: undefined,
}

const emailResponseDto: EmailResponseDto = {
    email,
    exists: true,
    format: EmailPatternEnum.FDotLast,
    domain,
    username,
    createdAt: date,
    updatedAt: date,
}

describe('EmailService tests', () => {
    let service: EmailService
    let emailRepo: jest.Mocked<Repository<Email>>
    let mapper: jest.Mocked<Mapper>

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                {
                    provide: getRepositoryToken(Email),
                    useValue: mockedEmailRepo,
                },
                { provide: getMapperToken(), useValue: mockedMapper },
                EmailService,
            ],
        }).compile()

        service = moduleRef.get(EmailService)
        emailRepo = moduleRef.get(getRepositoryToken(Email))
        mapper = moduleRef.get(getMapperToken())
    })

    afterEach(() => jest.resetAllMocks())

    describe('createEmail', () => {
        it('should create and return a mapped EmailResponseDto', async () => {
            const createEmailOptions: ICreateEmailRequestDto = {
                email,
                exists: true,
                format: EmailPatternEnum.FDotLast,
            }

            emailRepo.existsBy.mockResolvedValue(false)
            emailRepo.create.mockReturnValue(emailEntity)
            emailRepo.save.mockResolvedValue(emailEntity)

            when<EmailResponseDto, [Email, typeof Email, typeof EmailResponseDto]>(mapper.map)
                .calledWith(emailEntity, Email, EmailResponseDto)
                .mockReturnValue(emailResponseDto)

            const result = await service.createEmail(createEmailOptions)

            expect(emailRepo.existsBy).toHaveBeenCalledWith({ id: email })
            expect(emailRepo.save).toHaveBeenCalled()
            expect(mapper.map).toHaveBeenCalledWith(emailEntity, Email, EmailResponseDto)
            expect(result).toEqual(emailResponseDto)
        })

        it('should throw EmailAlreadyExistsException if exists', async () => {
            const createEmailOptions: ICreateEmailRequestDto = {
                email,
                exists: true,
                format: EmailPatternEnum.FDotLast,
            }

            emailRepo.existsBy.mockResolvedValue(true)

            await expect(service.createEmail(createEmailOptions)).rejects.toThrow(EmailAlreadyExistsException)
            expect(emailRepo.existsBy).toHaveBeenCalledWith({ id: email })
            expect(emailRepo.save).not.toHaveBeenCalled()
        })
    })

    describe('getEmails', () => {
        it('should return mapped list of emails', async () => {
            emailRepo.find.mockResolvedValue([emailEntity])

            when<EmailResponseDto[], [Email[], typeof Email, typeof EmailResponseDto]>(mapper.mapArray)
                .calledWith([emailEntity], Email, EmailResponseDto)
                .mockReturnValue([emailResponseDto])

            const result = await service.getEmails()

            expect(emailRepo.find).toHaveBeenCalled()
            expect(mapper.mapArray).toHaveBeenCalledWith([emailEntity], Email, EmailResponseDto)
            expect(result).toEqual([emailResponseDto])
        })
    })

    describe('getEmail', () => {
        it('should return mapped email when found', async () => {
            emailRepo.findOneBy.mockResolvedValue(emailEntity)

            when<EmailResponseDto, [Email, typeof Email, typeof EmailResponseDto]>(mapper.map)
                .calledWith(emailEntity, Email, EmailResponseDto)
                .mockReturnValue(emailResponseDto)

            const result = await service.getEmail(email)

            expect(emailRepo.findOneBy).toHaveBeenCalledWith({ id: email })
            expect(mapper.map).toHaveBeenCalledWith(emailEntity, Email, EmailResponseDto)
            expect(result).toEqual(emailResponseDto)
        })

        it('should throw EmailNotFoundException when not found', async () => {
            emailRepo.findOneBy.mockResolvedValue(null)
            await expect(service.getEmail('missing@test.com')).rejects.toThrow(EmailNotFoundException)
        })
    })

    describe('updateEmail', () => {
        it('should update and return mapped email when found', async () => {
            const options: IUpdateEmailRequestDto = { format: EmailPatternEnum.First, exists: false }
            const updatedEntity = Object.assign({}, emailEntity, options)
            const updatedEmailResponseDto = Object.assign({}, emailResponseDto, options)

            emailRepo.findOneBy.mockResolvedValue({ ...emailEntity })
            emailRepo.save.mockResolvedValue(updatedEntity)

            when<EmailResponseDto, [Email, typeof Email, typeof EmailResponseDto]>(mapper.map)
                .calledWith(updatedEntity, Email, EmailResponseDto)
                .mockReturnValue(updatedEmailResponseDto)

            const result = await service.updateEmail(email, options)

            expect(emailRepo.findOneBy).toHaveBeenCalledWith({ id: email })
            expect(emailRepo.save).toHaveBeenCalled()
            expect(mapper.map).toHaveBeenCalledWith(updatedEntity, Email, EmailResponseDto)
            expect(result).toEqual(updatedEmailResponseDto)
        })

        it('should create and save when email not found', async () => {
            const options: IUpdateEmailRequestDto = { format: EmailPatternEnum.First, exists: false }
            const newEntity = { id: email, username, domain, format: options.format, exists: options.exists }

            emailRepo.findOneBy.mockResolvedValue(null)
            emailRepo.create.mockReturnValue(newEntity as Email)
            emailRepo.save.mockResolvedValue(newEntity as Email)

            when<EmailResponseDto, [Email, typeof Email, typeof EmailResponseDto]>(mapper.map)
                .calledWith(newEntity as Email, Email, EmailResponseDto)
                .mockReturnValue(emailResponseDto)

            const result = await service.updateEmail(email, options)

            expect(emailRepo.findOneBy).toHaveBeenCalledWith({ id: email })
            expect(emailRepo.create).toHaveBeenCalled()
            expect(emailRepo.save).toHaveBeenCalled()
            expect(result).toEqual(emailResponseDto)
        })
    })
})
