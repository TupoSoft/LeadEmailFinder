import { Test } from '@nestjs/testing'
import {
    ClassSerializerInterceptor,
    ConflictException,
    HttpStatus,
    INestApplication,
    NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import request from 'supertest'
import { EmailAdministrationController } from './email-administration.controller'
import { EmailPatternEnum } from '@tuposoft/lead-email-finder/common'
import { CreateEmailRequestDto } from './create-email-request.dto'
import { UpdateEmailRequestDto } from './update-email-request.dto'
import { EmailResponseDto } from './email-response.dto'
import { PermissionsGuard, setAuthPrincipal } from '@tuposoft/lead-email-finder/modules/auth'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { NextFunction, Request, Response } from 'express'
import { Email } from '../../../domain/email'
import { EmailAlreadyExistsError, EmailNotFoundError } from '../../../domain/errors'
import { EmailAdministrationService } from '../../../application/email-administration.service'

const mockEmailAdministration: jest.Mocked<Pick<EmailAdministrationService, keyof EmailAdministrationService>> = {
    createEmail: jest.fn(),
    getEmails: jest.fn(),
    getEmail: jest.fn(),
    updateEmail: jest.fn(),
    upsertEmail: jest.fn(),
}

const principal: AuthPrincipal = {
    credentialKind: 'service_client',
    issuer: 'https://issuer.example.test',
    subject: 'platform-admin-client',
    organizationId: 'organization-1',
    membershipRole: 'platform_admin',
    permissions: ['platform:admin'],
    credentialId: 'credential-1',
}

const username = 'danilo'
const format = EmailPatternEnum.First
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

const emailRecord: Email = {
    organizationId: principal.organizationId,
    id: email,
    username,
    domain,
    exists,
    createdAt: date,
    updatedAt: date,
}

const emailResponseDto: EmailResponseDto = {
    email,
    username,
    domain,
    exists,
    createdAt: date,
    updatedAt: date,
}

describe('EmailAdministrationController', () => {
    let app: INestApplication

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [EmailAdministrationController],
            providers: [
                {
                    provide: EmailAdministrationService,
                    useValue: mockEmailAdministration,
                },
            ],
        })
            .overrideGuard(PermissionsGuard)
            .useValue(null)
            .compile()

        app = moduleRef.createNestApplication()
        app.use((req: Request, _res: Response, next: NextFunction) => {
            setAuthPrincipal(req, principal)
            next()
        })
        app.useGlobalInterceptors(
            new ClassSerializerInterceptor(app.get(Reflector), {
                strategy: 'excludeAll',
                enableImplicitConversion: true,
            }),
        )
        await app.init()
    })

    afterEach(() => jest.clearAllMocks())

    afterAll(async () => {
        await app.close()
    })

    describe('POST /emails', () => {
        it('should create an email', async () => {
            mockEmailAdministration.createEmail.mockResolvedValue(emailRecord)

            await request(app.getHttpServer())
                .post('/emails')
                .send(createEmailRequestDto)
                .expect(HttpStatus.CREATED)
                .expect(JSON.stringify(emailResponseDto))

            expect(mockEmailAdministration.createEmail).toHaveBeenCalledWith(
                principal.organizationId,
                createEmailRequestDto,
            )
        })

        it('should return 409 if email already exists', async () => {
            const emailAlreadyExistsError = new EmailAlreadyExistsError(email)
            const conflictException = new ConflictException(emailAlreadyExistsError.message)
            mockEmailAdministration.createEmail.mockRejectedValue(emailAlreadyExistsError)

            await request(app.getHttpServer())
                .post('/emails')
                .send(createEmailRequestDto)
                .expect(HttpStatus.CONFLICT)
                .expect(JSON.stringify(conflictException.getResponse()))

            expect(mockEmailAdministration.createEmail).toHaveBeenCalledWith(
                principal.organizationId,
                createEmailRequestDto,
            )
        })
    })

    describe('GET /emails', () => {
        it('should return all emails', async () => {
            mockEmailAdministration.getEmails.mockResolvedValue([emailRecord])
            await request(app.getHttpServer())
                .get('/emails')
                .expect(HttpStatus.OK)
                .expect(JSON.stringify([emailResponseDto]))
            expect(mockEmailAdministration.getEmails).toHaveBeenCalledWith(principal.organizationId)
        })
    })

    describe('GET /emails/:email', () => {
        it('should return a specific email', async () => {
            mockEmailAdministration.getEmail.mockResolvedValue(emailRecord)
            await request(app.getHttpServer())
                .get(`/emails/${email}`)
                .expect(HttpStatus.OK)
                .expect(JSON.stringify(emailResponseDto))

            expect(mockEmailAdministration.getEmail).toHaveBeenCalledWith(principal.organizationId, email)
        })

        it('should return 404 if email not found', async () => {
            const emailNotFoundError = new EmailNotFoundError(email)
            const notFoundException = new NotFoundException(emailNotFoundError.message)
            mockEmailAdministration.getEmail.mockRejectedValue(emailNotFoundError)

            await request(app.getHttpServer())
                .get(`/emails/${email}`)
                .expect(HttpStatus.NOT_FOUND)
                .expect(JSON.stringify(notFoundException.getResponse()))

            expect(mockEmailAdministration.getEmail).toHaveBeenCalledWith(principal.organizationId, email)
        })
    })

    describe('PATCH /emails/:email', () => {
        it('should update an email', async () => {
            const response = structuredClone(emailRecord)
            response.exists = true
            const responseDto = structuredClone(emailResponseDto)
            responseDto.exists = true

            mockEmailAdministration.updateEmail.mockResolvedValue(response)

            await request(app.getHttpServer())
                .patch(`/emails/${email}`)
                .send(updateEmailRequestDto)
                .expect(HttpStatus.OK)
                .expect(JSON.stringify(responseDto))

            expect(mockEmailAdministration.updateEmail).toHaveBeenCalledWith(principal.organizationId, email, {
                format: undefined,
                exists: updateEmailRequestDto.exists,
            })
        })

        it('should return 404 if email not found during update', async () => {
            const emailNotFoundError = new EmailNotFoundError(email)
            const notFoundException = new NotFoundException(emailNotFoundError.message)
            mockEmailAdministration.updateEmail.mockRejectedValue(emailNotFoundError)

            await request(app.getHttpServer())
                .patch(`/emails/${email}`)
                .send(updateEmailRequestDto)
                .expect(HttpStatus.NOT_FOUND)
                .expect(JSON.stringify(notFoundException.getResponse()))

            expect(mockEmailAdministration.updateEmail).toHaveBeenCalledWith(principal.organizationId, email, {
                format: undefined,
                exists: updateEmailRequestDto.exists,
            })
        })
    })
})
