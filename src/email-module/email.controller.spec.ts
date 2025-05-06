import { Test } from '@nestjs/testing'
import { ConflictException, HttpStatus, INestApplication, NotFoundException } from '@nestjs/common'
import request from 'supertest'
import { EmailController } from './email.controller'
import { EMAIL_SERVICE_TOKEN } from './email.constants'
import { IEmailService } from './interfaces'
import { EmailAlreadyExistsException, EmailNotFoundException } from './exceptions'
import { CreateEmailRequestDto, EmailResponseDto, UpdateEmailRequestDto } from './dto'
import { EmailPatternEnum } from './enums'

const mockEmailService: jest.Mocked<IEmailService> = {
    createEmail: jest.fn(),
    getEmails: jest.fn(),
    getEmail: jest.fn(),
    updateEmail: jest.fn(),
}

const username = 'danilo'
const format: EmailPatternEnum = EmailPatternEnum.First
const domain = 'microsoft.com'
const email = `${username}@${domain}`
const exists = false
const date = new Date(123)

const createEmailRequestDto: CreateEmailRequestDto = {
    email,
    exists,
    format,
}

const updateEmailRequestDto: UpdateEmailRequestDto = {
    exists: true,
}

const emailResponseDto: EmailResponseDto = {
    email,
    username,
    domain,
    exists,
    createdAt: date,
    updatedAt: date,
}

describe('EmailController', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [EmailController],
            providers: [
                {
                    provide: EMAIL_SERVICE_TOKEN,
                    useValue: mockEmailService,
                },
            ],
        }).compile()

        app = moduleRef.createNestApplication()
        await app.init()
    })

    afterEach(() => jest.clearAllMocks())

    afterAll(async () => {
        await app.close()
    })

    describe('POST /emails', () => {
        it('should create an email', async () => {
            mockEmailService.createEmail.mockResolvedValue(emailResponseDto)

            await request(app.getHttpServer())
                .post('/emails')
                .send(createEmailRequestDto)
                .expect(HttpStatus.CREATED)
                .expect(JSON.stringify(emailResponseDto))
        })

        it('should return 409 if email already exists', async () => {
            const emailAlreadyExistsException = new EmailAlreadyExistsException({ email })
            const conflictException = new ConflictException(emailAlreadyExistsException.message)
            mockEmailService.createEmail.mockRejectedValue(emailAlreadyExistsException)

            await request(app.getHttpServer())
                .post('/emails')
                .send(createEmailRequestDto)
                .expect(HttpStatus.CONFLICT)
                .expect(JSON.stringify(conflictException.getResponse()))
        })
    })

    describe('GET /emails', () => {
        it('should return all emails', async () => {
            const data: EmailResponseDto[] = [emailResponseDto]
            mockEmailService.getEmails.mockResolvedValue(data)
            await request(app.getHttpServer()).get('/emails').expect(HttpStatus.OK).expect(JSON.stringify(data))
        })
    })

    describe('GET /emails/:email', () => {
        it('should return a specific email', async () => {
            mockEmailService.getEmail.mockResolvedValue(emailResponseDto)
            await request(app.getHttpServer())
                .get(`/emails/${email}`)
                .expect(HttpStatus.OK)
                .expect(JSON.stringify(emailResponseDto))
        })

        it('should return 404 if email not found', async () => {
            const emailNotFoundException = new EmailNotFoundException({ email })
            const notFoundException = new NotFoundException(emailNotFoundException.message)
            mockEmailService.getEmail.mockRejectedValue(emailNotFoundException)

            await request(app.getHttpServer())
                .get(`/emails/${email}`)
                .expect(HttpStatus.NOT_FOUND)
                .expect(JSON.stringify(notFoundException.getResponse()))
        })
    })

    describe('PATCH /emails/:email', () => {
        it('should update an email', async () => {
            const response = structuredClone(emailResponseDto)
            response.exists = true

            mockEmailService.updateEmail.mockResolvedValue(response)

            await request(app.getHttpServer())
                .patch(`/emails/${email}`)
                .send(updateEmailRequestDto)
                .expect(HttpStatus.OK)
                .expect(JSON.stringify(response))
        })

        it('should return 404 if email not found during update', async () => {
            const emailNotFoundException = new EmailNotFoundException({ email })
            const notFoundException = new NotFoundException(emailNotFoundException.message)
            mockEmailService.updateEmail.mockRejectedValue(emailNotFoundException)

            await request(app.getHttpServer())
                .patch(`/emails/${email}`)
                .send(updateEmailRequestDto)
                .expect(HttpStatus.NOT_FOUND)
                .expect(JSON.stringify(notFoundException.getResponse()))
        })
    })
})
