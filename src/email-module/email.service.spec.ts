import { beforeEach } from '@jest/globals'
import { Test } from '@nestjs/testing'
import { EmailService } from './email.service'
import { Email } from './email.schema'
import { getModelToken } from '@nestjs/mongoose'
import { Mapper } from '@automapper/core'
import { getMapperToken } from '@automapper/nestjs'
import { CreateEmailOptions, IEmailModel } from './interfaces'
import { EmailPatternEnum } from './enums'
import { EmailResponseDto } from './dto'
import { when } from 'jest-when'

const now = Date.now()
const date = new Date(now)
jest.useFakeTimers({ now })

const mockedEmailModel: jest.Mocked<IEmailModel> = {
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

describe('EmailService tests', () => {
    let service: EmailService
    let emailModel: jest.Mocked<IEmailModel>
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
    })

    describe('createEmail', () => {
        it('should create and return a mapped EmailResponseDto', async () => {
            const createEmailOptions: CreateEmailOptions = {
                email: 'user@test.com',
                exists: true,
                format: EmailPatternEnum.FDotLast,
            }

            const emailDoc: Email = {
                _id: createEmailOptions.email,
                exists: true,
                format: EmailPatternEnum.FDotLast,
                domain: 'test.com',
                username: 'user',
                createdAt: date,
                updatedAt: date,
            }

            const emailResponseDto: EmailResponseDto = {
                email: emailDoc._id,
                exists: true,
                format: EmailPatternEnum.FDotLast,
                domain: 'test.com',
                username: 'user',
                createdAt: date,
                updatedAt: date,
            }

            emailModel.exists.mockResolvedValue(null)
            emailModel.insertOne.mockResolvedValue(emailDoc)

            when<EmailResponseDto, [Email, typeof Email, typeof EmailResponseDto]>(mapper.map)
                .calledWith(emailDoc, Email, EmailResponseDto)
                .mockReturnValue(emailResponseDto)

            const result = await service.createEmail(createEmailOptions)

            expect(emailModel.exists).toHaveBeenCalledWith({ _id: createEmailOptions.email })
            expect(emailModel.insertOne).toHaveBeenCalledWith(emailDoc)
            expect(mapper.map).toHaveBeenCalledWith(emailDoc, Email, EmailResponseDto)
            expect(result).toEqual(emailResponseDto)
        })
    })
})
