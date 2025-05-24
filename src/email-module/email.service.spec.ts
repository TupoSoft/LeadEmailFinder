import { beforeEach } from '@jest/globals'
import { Test } from '@nestjs/testing'
import { EmailService } from './email.service'
import { Email } from './email.schema'
import { getModelToken } from '@nestjs/mongoose'
import { Mapper } from '@automapper/core'
import { getMapperToken } from '@automapper/nestjs'
import { EmailPatternEnum, ICreateEmailOptions, IUpdateEmailOptions } from '../common'
import { EmailResponseDto } from './dto'
import { when } from 'jest-when'
import { EmailAlreadyExistsException, EmailNotFoundException } from './exceptions'
import { Model } from 'mongoose'

const now = Date.now()
const date = new Date(now)
jest.useFakeTimers({ now })

const mockedEmailModel: jest.Mocked<
    Pick<Model<Email>, 'find' | 'exists' | 'insertOne' | 'findById' | 'findOneAndUpdate'>
> = {
    find: jest.fn(),
    exists: jest.fn(),
    insertOne: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
}

const mockedMapper: jest.Mocked<Pick<Mapper, 'map' | 'mapArray'>> = {
    map: jest.fn(),
    mapArray: jest.fn(),
}

const email = 'user@test.com'

const emailDoc: Email = {
    _id: email,
    exists: true,
    format: EmailPatternEnum.FDotLast,
    domain: 'test.com',
    username: 'user',
    createdAt: date,
    updatedAt: date,
}

const emailResponseDto: EmailResponseDto = {
    email,
    exists: true,
    format: EmailPatternEnum.FDotLast,
    domain: 'test.com',
    username: 'user',
    createdAt: date,
    updatedAt: date,
}

describe('EmailService tests', () => {
    let service: EmailService
    let emailModel: jest.Mocked<Model<Email>>
    let mapper: jest.Mocked<Mapper>

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                {
                    provide: getModelToken(Email.name),
                    useValue: mockedEmailModel,
                },
                { provide: getMapperToken(), useValue: mockedMapper },
                EmailService,
            ],
        }).compile()

        service = moduleRef.get(EmailService)
        emailModel = moduleRef.get(getModelToken(Email.name))
        mapper = moduleRef.get(getMapperToken())

        jest.clearAllMocks()
    })

    describe('createEmail', () => {
        it('should create and return a mapped EmailResponseDto', async () => {
            const createEmailOptions: ICreateEmailOptions = {
                email: 'user@test.com',
                exists: true,
                format: EmailPatternEnum.FDotLast,
            }

            emailModel.exists.mockResolvedValue(null)
            emailModel.insertOne.mockResolvedValue(emailDoc as any)

            when<EmailResponseDto, [Email, typeof Email, typeof EmailResponseDto]>(mapper.map)
                .calledWith(emailDoc, Email, EmailResponseDto)
                .mockReturnValue(emailResponseDto)

            const result = await service.createEmail(createEmailOptions)

            expect(emailModel.exists).toHaveBeenCalledWith({ _id: createEmailOptions.email })
            expect(emailModel.insertOne).toHaveBeenCalledWith(emailDoc)
            expect(mapper.map).toHaveBeenCalledWith(emailDoc, Email, EmailResponseDto)
            expect(result).toEqual(emailResponseDto)
        })

        it('should throw EmailAlreadyExistsException if exists', async () => {
            const createEmailOptions: ICreateEmailOptions = {
                email: 'user@test.com',
                exists: true,
                format: EmailPatternEnum.FDotLast,
            }

            emailModel.exists.mockResolvedValue(emailDoc)

            await expect(service.createEmail(createEmailOptions)).rejects.toThrow(EmailAlreadyExistsException)
            expect(emailModel.exists).toHaveBeenCalledWith({ _id: createEmailOptions.email })
            expect(emailModel.insertOne).not.toHaveBeenCalled()
        })
    })

    describe('getEmails', () => {
        it('should return mapped list of emails', async () => {
            emailModel.find.mockReturnValue({
                exec: jest.fn().mockResolvedValue([emailDoc]),
            } as any)

            when<EmailResponseDto[], [Email[], typeof Email, typeof EmailResponseDto]>(mapper.mapArray)
                .calledWith([emailDoc], Email, EmailResponseDto)
                .mockReturnValue([emailResponseDto])

            const result = await service.getEmails()

            expect(emailModel.find).toHaveBeenCalled()
            expect(mapper.mapArray).toHaveBeenCalledWith([emailDoc], Email, EmailResponseDto)
            expect(result).toEqual([emailResponseDto])
        })
    })

    describe('getEmail', () => {
        it('should return mapped email when found', async () => {
            emailModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(emailDoc) } as any)

            when<EmailResponseDto, [Email, typeof Email, typeof EmailResponseDto]>(mapper.map)
                .calledWith(emailDoc, Email, EmailResponseDto)
                .mockReturnValue(emailResponseDto)

            const result = await service.getEmail(email)

            expect(emailModel.findById).toHaveBeenCalledWith(email)
            expect(mapper.map).toHaveBeenCalledWith(emailDoc, Email, EmailResponseDto)
            expect(result).toEqual(emailResponseDto)
        })

        it('should throw EmailNotFoundException when not found', async () => {
            emailModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) } as any)
            await expect(service.getEmail('missing@test.com')).rejects.toThrow(EmailNotFoundException)
        })
    })

    describe('updateEmail', () => {
        it('should update and return mapped email when found', async () => {
            const options: IUpdateEmailOptions = { format: EmailPatternEnum.First, exists: false }
            const updatedDoc = Object.assign({}, emailDoc, options)
            const updatedEmailResponseDto = Object.assign({}, emailResponseDto, options)

            emailModel.findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(updatedDoc) } as any)

            when<EmailResponseDto, [Email, typeof Email, typeof EmailResponseDto]>(mapper.map)
                .calledWith(updatedDoc, Email, EmailResponseDto)
                .mockReturnValue(updatedEmailResponseDto)

            const result = await service.updateEmail(email, options)

            expect(emailModel.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: email },
                { $set: options },
                { new: true, upsert: true },
            )
            expect(mapper.map).toHaveBeenCalledWith(updatedDoc, Email, EmailResponseDto)
            expect(result).toEqual(updatedEmailResponseDto)
        })

        it('should throw EmailNotFoundException when update returns null', async () => {
            emailModel.findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) } as any)

            await expect(
                service.updateEmail(email, { format: EmailPatternEnum.FirstHyphenLast, exists: true }),
            ).rejects.toThrow(EmailNotFoundException)
        })
    })
})
