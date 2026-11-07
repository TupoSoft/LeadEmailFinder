import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { BFF_SESSION_CONFIGURATION } from '../application/bff-session-configuration'
import { CurrentAccountService } from '../application/current-account.service'
import { NativeSignInStateService, SIGN_IN_STATES } from '../application/native-sign-in-state.service'
import { VERIFIED_HUMAN_SESSION_READER } from '../application/verified-human-session-reader'
import { BffSessionController } from './native-browser-auth.controller'
import { BrowserSessionMutationGuard } from './browser-session-mutation.guard'
import { CsrfGuard } from './csrf.guard'
import { OriginGuard } from './origin.guard'

describe('narrow native browser Swagger contracts', () => {
    let app: INestApplication
    let document: OpenAPIObject
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [BffSessionController],
            providers: [
                { provide: BFF_SESSION_CONFIGURATION, useValue: { appBaseUrl: 'https://app.example.test' } },
                { provide: CurrentAccountService, useValue: {} },
                { provide: NativeSignInStateService, useValue: {} },
                { provide: VERIFIED_HUMAN_SESSION_READER, useValue: {} },
                OriginGuard,
                CsrfGuard,
                BrowserSessionMutationGuard,
            ],
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.init()
        const configuration = new DocumentBuilder()
            .addCookieAuth('lef_session', { type: 'apiKey' }, 'lef_session')
            .addSecurity('x-csrf-token', { type: 'apiKey', in: 'header', name: 'x-csrf-token' })
            .build()
        document = SwaggerModule.createDocument(app, configuration)
    })
    afterAll(async () => app.close())

    it('publishes only the eight explicitly owned browser auth operations', () => {
        expect(Object.keys(document.paths).sort()).toEqual([
            '/v1/auth/logout',
            '/v1/auth/magic-link/request',
            '/v1/auth/magic-link/verify',
            '/v1/auth/mfa/enroll',
            '/v1/auth/mfa/recover',
            '/v1/auth/mfa/verify',
            '/v1/auth/session',
            '/v1/auth/sign-in-state',
        ])
    })

    it('retains current-account security, nullable email, safe fields, and exact error schemas', () => {
        const operation = document.paths['/v1/auth/session']?.get
        expect(operation?.operationId).toBe('getCurrentAccount')
        expect(operation?.security).toEqual([{ lef_session: [] }])
        for (const [code, dto] of [
            ['200', 'CurrentAccountContextDto'],
            ['401', 'AuthenticationRequiredResponseDto'],
            ['403', 'HumanSessionRequiredResponseDto'],
        ]) {
            expect(operation?.responses[code]).toMatchObject({
                content: { 'application/json': { schema: { $ref: `#/components/schemas/${dto}` } } },
            })
        }
        const schema = document.components?.schemas?.CurrentAccountContextDto
        expect(schema).toHaveProperty('properties.email', expect.objectContaining({ type: 'string', nullable: true }))
        expect(schema && 'properties' in schema ? Object.keys(schema.properties ?? {}) : []).toEqual([
            'email',
            'membership',
            'organization',
            'capabilities',
            'grantableServiceClientPermissions',
        ])
    })

    it('publishes safe five-state output without native identity or session fields', () => {
        expect(document.components?.schemas?.SignInStateDto).toMatchObject({
            type: 'object',
            properties: { state: { type: 'string', enum: [...SIGN_IN_STATES] } },
            required: ['state'],
        })
        const schema = document.components?.schemas?.SignInStateDto
        expect(schema && 'properties' in schema ? Object.keys(schema.properties ?? {}) : []).toEqual(['state'])
        expect(document.paths['/v1/auth/sign-in-state'].get?.security).toEqual([])
    })

    it('documents narrow mutation bodies, their safe responses, and current fail-closed availability', () => {
        for (const path of [
            'magic-link/request',
            'magic-link/verify',
            'mfa/enroll',
            'mfa/verify',
            'mfa/recover',
            'logout',
        ]) {
            const operation = document.paths[`/v1/auth/${path}`].post
            expect(operation?.requestBody).toHaveProperty('content.application/json.schema.$ref')
            expect(operation?.responses['503']).toMatchObject({
                content: {
                    'application/json': { schema: { $ref: '#/components/schemas/AuthenticationUnavailableDto' } },
                },
            })
        }
        expect(document.paths['/v1/auth/magic-link/request'].post?.security).toEqual([])
        expect(document.paths['/v1/auth/magic-link/verify'].post?.security).toEqual([])
        expect(document.paths['/v1/auth/logout'].post?.security).toEqual([{ lef_session: [], 'x-csrf-token': [] }])
        expect(document.paths['/v1/auth/logout'].post?.responses['204']).not.toHaveProperty('content')
        for (const path of ['mfa/enroll', 'logout']) {
            expect(document.paths[`/v1/auth/${path}`].post?.requestBody).toHaveProperty('required', false)
        }
    })
})
