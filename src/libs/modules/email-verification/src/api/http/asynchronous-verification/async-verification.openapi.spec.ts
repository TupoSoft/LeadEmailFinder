import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface'
import { PermissionsGuard } from '@tuposoft/lead-email-finder/modules/auth'
import { ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN } from '../../../application/delivery/async/async-email-verification.service'
import { VerificationRateLimitGuard } from '../verification-rate-limit.guard'
import { AsyncEmailVerificationController } from './async-email-verification.controller'

// Explicit annotations must remain useful even without Nest's generated plugin metadata.
describe('asynchronous verification OpenAPI contract', () => {
    let app: INestApplication
    let document: OpenAPIObject

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [AsyncEmailVerificationController],
            providers: [{ provide: ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN, useValue: {} }],
        })
            .overrideGuard(PermissionsGuard)
            .useValue({ canActivate: () => true })
            .overrideGuard(VerificationRateLimitGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        document = SwaggerModule.createDocument(app, new DocumentBuilder().build())
    })

    afterAll(async () => {
        await app.close()
    })

    it('describes all five states as disjoint required response variants with safe examples', () => {
        const status = document.paths['/verifyAsync/{id}'].get!
        expect(status.operationId).toBe('AsyncEmailVerificationController_getAsyncVerificationState')
        const response = status.responses['200']!
        if ('$ref' in response) throw new Error('expected inline response')
        const content = response.content!['application/json']
        const schema = content.schema as SchemaObject
        expect(schema.discriminator?.propertyName).toBe('state')
        const variants = schema.oneOf!
        expect(variants).toHaveLength(5)
        for (const [index, state] of ['queued', 'running', 'completed', 'failed', 'unavailable'].entries()) {
            const variant = variants[index]
            if (!('$ref' in variant)) throw new Error('expected named state schema')
            const name = variant.$ref.split('/').at(-1)!
            const component = document.components!.schemas![name] as SchemaObject
            expect(component.properties!.state).toMatchObject({ enum: [state] })
            expect(component.required).toEqual(
                state === 'completed'
                    ? ['state', 'result', 'operation']
                    : state === 'failed'
                      ? ['state', 'failureCode', 'operation']
                      : ['state'],
            )
            expect(Object.keys(component.properties!)).toEqual(component.required)
            expect(content.examples![state]).toBeDefined()
        }
        expect(JSON.stringify(content)).not.toMatch(/failedReason|stacktrace|provider diagnostics|attemptsMade/)
    })

    it('describes nullable evidence, reviewed enums, optional fields, and no internal result properties', () => {
        const result = document.components!.schemas!.AsyncVerificationResultDto as SchemaObject
        expect(result.properties!.exists).toMatchObject({ type: 'boolean', nullable: true })
        expect(result.properties!.catchAll).toMatchObject({ type: 'boolean', nullable: true })
        expect(result.required).toEqual([
            'id',
            'email',
            'localPart',
            'domain',
            'exists',
            'catchAll',
            'reason',
            'sources',
        ])
        expect(Object.keys(result.properties!)).toEqual([
            'id',
            'email',
            'localPart',
            'domain',
            'format',
            'exists',
            'catchAll',
            'reason',
            'sources',
            'mxDomain',
            'targetExchange',
        ])
        expect((result.properties!.sources as SchemaObject).items).toMatchObject({
            enum: ['mx', 'microsoft_1', 'microsoft_2', 'microsoft_4', 'mimecast', 'linkedin'],
        })
    })

    it('documents the unchanged request, accepted ID, authorization, credit, and concealed lookup errors', () => {
        const create = document.paths['/verifyAsync'].post!
        expect(create.operationId).toBe('AsyncEmailVerificationController_verifyAsync')
        expect(Object.keys(create.responses).sort()).toEqual([
            '202',
            '400',
            '401',
            '402',
            '403',
            '409',
            '410',
            '429',
        ])
        expect(Object.keys(document.paths['/verifyAsync/{id}'].get!.responses).sort()).toEqual([
            '200',
            '400',
            '401',
            '403',
            '404',
        ])
        expect(document.components!.schemas!.VerifyAsyncRequestBodyDto).toMatchObject({
            required: ['email'],
            properties: { email: { type: 'string', format: 'email', example: 'person@lef.test' } },
        })
        expect(document.components!.schemas!.VerifyAsyncResponseDto).toMatchObject({
            required: ['id'],
            properties: { id: { type: 'string', format: 'uuid' } },
        })
        expect(create.security).toEqual([{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }])
        expect(document.paths['/verifyAsync/{id}'].get!.security).toEqual([{ lef_session: [] }, { oidc: [] }])
    })
})
