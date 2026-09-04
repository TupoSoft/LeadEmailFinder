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

describe('BFF current-account Swagger contract', () => {
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
})
