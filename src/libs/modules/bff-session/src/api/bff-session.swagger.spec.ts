import { INestApplication, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { BFF_SESSION_COOKIE_NAME } from '@tuposoft/lead-email-finder/modules/auth'
import { BffSessionFlowService } from '../application/bff-session-flow.service'
import { BFF_SESSION_CONFIGURATION } from '../application/bff-session-configuration'
import { CurrentAccountService } from '../application/current-account.service'
import { BffSessionController } from './bff-session.controller'

@Module({
    controllers: [BffSessionController],
    providers: [
        { provide: BffSessionFlowService, useValue: {} },
        { provide: CurrentAccountService, useValue: {} },
        {
            provide: BFF_SESSION_CONFIGURATION,
            useValue: {
                appBaseUrl: 'https://app.example.test',
                issuer: 'https://issuer.example.test',
                backchannelUrl: 'https://issuer.example.test',
                jwksUri: 'https://issuer.example.test/protocol/openid-connect/certs',
                clientId: 'lef-web-bff',
                clientSecret: 'not-used',
                sessionIdleTimeoutMs: 1_000,
                sessionAbsoluteTimeoutMs: 2_000,
                isSecureCookie: true,
            },
        },
    ],
})
class BffSessionSwaggerTestModule {}

describe('BFF Swagger contracts', () => {
    let app: INestApplication
    let document: OpenAPIObject

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [BffSessionSwaggerTestModule] }).compile()
        app = moduleRef.createNestApplication({ logger: false })
        await app.init()
        const configuration = new DocumentBuilder()
            .addCookieAuth(BFF_SESSION_COOKIE_NAME, { type: 'apiKey' }, BFF_SESSION_COOKIE_NAME)
            .build()
        document = SwaggerModule.createDocument(app, configuration)
    })

    afterAll(async () => {
        await app.close()
    })

    it('publishes the human-session security and exact success and failure schemas', () => {
        const operation = document.paths['/v1/auth/session']?.get

        expect(operation?.security).toEqual([{ [BFF_SESSION_COOKIE_NAME]: [] }])
        expect(operation?.responses['200']).toMatchObject({
            content: {
                'application/json': { schema: { $ref: '#/components/schemas/CurrentAccountContextDto' } },
            },
        })
        expect(operation?.responses['401']).toMatchObject({
            content: {
                'application/json': { schema: { $ref: '#/components/schemas/AuthenticationRequiredResponseDto' } },
            },
        })
        expect(operation?.responses['403']).toMatchObject({
            content: {
                'application/json': { schema: { $ref: '#/components/schemas/HumanSessionRequiredResponseDto' } },
            },
        })
    })

    it('keeps email nullable and excludes platform administration from the grantable permission enum', () => {
        const accountSchema = document.components?.schemas?.['CurrentAccountContextDto']
        const accountProperties = 'properties' in accountSchema! ? accountSchema.properties : undefined
        const emailSchema = accountProperties?.['email']
        const permissionsSchema = accountProperties?.['grantableServiceClientPermissions']

        expect(emailSchema).toMatchObject({ type: 'string', format: 'email', nullable: true })
        expect(permissionsSchema).toMatchObject({
            type: 'array',
            items: {
                type: 'string',
                enum: [
                    'verification:run',
                    'verification:read',
                    'members:manage',
                    'credentials:manage',
                    'billing:read',
                    'billing:manage',
                ],
            },
        })
        expect(JSON.stringify(permissionsSchema)).not.toContain('platform:admin')
    })

    it('publishes the callback query, redirect, privacy-header, and redacted error contract', () => {
        const operation = document.paths['/v1/auth/callback']?.get

        expect(operation?.parameters).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'code',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                }),
                expect.objectContaining({
                    name: 'state',
                    in: 'query',
                    required: false,
                    schema: { type: 'string' },
                }),
            ]),
        )
        expect(operation?.responses['302']).toMatchObject({
            description: expect.stringContaining('login_state_invalid'),
            headers: {
                Location: { schema: { type: 'string', format: 'uri' } },
                'Set-Cookie': { schema: { type: 'string' } },
                'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } },
                'Referrer-Policy': { schema: { type: 'string', enum: ['no-referrer'] } },
            },
        })
        expect(JSON.stringify(operation?.responses['302'])).toContain('authorization_code_exchange_failed')
        expect(JSON.stringify(operation?.responses['302'])).toContain('active_membership_required')
        for (const status of ['500', '502']) {
            expect(operation?.responses[status]).toMatchObject({
                headers: {
                    'Set-Cookie': { schema: { type: 'string' } },
                    'Cache-Control': { schema: { type: 'string', enum: ['no-store'] } },
                    'Referrer-Policy': { schema: { type: 'string', enum: ['no-referrer'] } },
                },
            })
        }
        expect(operation?.responses).not.toHaveProperty('400')
        expect(operation?.responses).not.toHaveProperty('401')
        expect(operation?.responses).not.toHaveProperty('403')
    })
})
