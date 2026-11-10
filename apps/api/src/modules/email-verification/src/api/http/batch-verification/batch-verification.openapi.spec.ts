import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import type { SchemaObject } from '@nestjs/swagger'
import { PermissionsGuard } from '@tuposoft/lead-email-finder/modules/auth'
import { BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN } from '../../../application/delivery/batch/batch-email-verification.service'
import { BatchEmailVerificationController } from './batch-email-verification.controller'

describe('batch verification OpenAPI contract', () => {
    let app: INestApplication
    let document: OpenAPIObject

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [BatchEmailVerificationController],
            providers: [{ provide: BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN, useValue: {} }],
        })
            .overrideGuard(PermissionsGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication({ logger: false })
        document = SwaggerModule.createDocument(app, new DocumentBuilder().build())
    })

    afterAll(async () => {
        await app.close()
    })

    it('documents multipart CSV upload with a binary file and the accepted asynchronous response', () => {
        const operation = document.paths['/verifyBatch/csv'].post!
        expect(operation.operationId).toBe('BatchEmailVerificationController_uploadFile')
        expect(operation.security).toEqual([{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }])
        expect(Object.keys(operation.responses).sort()).toEqual(['202', '401', '403', '422'])
        expect(operation.requestBody).toMatchObject({
            required: true,
            content: { 'multipart/form-data': { schema: { $ref: '#/components/schemas/UploadFileRequestDto' } } },
        })
        const upload = document.components!.schemas!.UploadFileRequestDto as SchemaObject
        expect(upload.required).toEqual(['file'])
        expect(upload.properties!.file).toMatchObject({ type: 'string', format: 'binary' })
        expect((upload.properties!.file as SchemaObject).description).toContain('104857600')
        expect((upload.properties!.file as SchemaObject).description).toContain('text/csv')
        expect(document.components!.schemas!.UploadFileResponseDto).toMatchObject({
            required: ['id'],
            properties: { id: { type: 'string', format: 'uuid' } },
        })
    })

    it('describes the five public states and only an optional safe terminal failure code', () => {
        const status = document.components!.schemas!.GetBatchStatusResponseDto as SchemaObject
        expect(status.properties!.status).toMatchObject({
            enum: ['queued', 'running', 'completed', 'failed', 'unavailable'],
        })
        expect(status.properties!.failureCode).toMatchObject({
            enum: ['invalid_csv', 'insufficient_credits', 'processing_failed'],
        })
        expect(status.required).toEqual([
            'id',
            'status',
            'progress',
            'total',
            'processed',
            'unprocessed',
            'resultsAvailable',
            'counts',
            'billing',
        ])
        expect(Object.keys(status.properties!)).toEqual([
            'id',
            'status',
            'failureCode',
            'progress',
            'total',
            'processed',
            'unprocessed',
            'resultsAvailable',
            'counts',
            'billing',
        ])
        expect(status.properties!.progress).toMatchObject({ minimum: 0, maximum: 100 })
        expect(status.properties!.resultsAvailable).toMatchObject({
            type: 'boolean',
            description:
                'True only for a completed job with a valid retained result location. Status polling does not check storage; a later missing object returns 404, and storage failures can still prevent download.',
        })
        expect(status.properties!.counts).toMatchObject({ $ref: '#/components/schemas/BatchStatusAddressCountsDto' })
        expect(status.properties!.billing).toMatchObject({ $ref: '#/components/schemas/BatchStatusBillingDto' })
        expect(document.components!.schemas!.BatchStatusAddressCountsDto).toBeDefined()
        expect(document.components!.schemas!.BatchStatusBillingDto).toBeDefined()
        expect(JSON.stringify(status)).not.toMatch(/failedReason|stacktrace|attemptsMade/)
        expect(Object.keys(document.paths['/verifyBatch/{id}'].get!.responses).sort()).toEqual([
            '200',
            '400',
            '401',
            '403',
            '404',
        ])
    })

    it('documents authenticated CSV download as binary with a safe attachment name', () => {
        const operation = document.paths['/verifyBatch/{id}/results'].get!
        expect(operation.operationId).toBe('BatchEmailVerificationController_getBatchResults')
        expect(operation.security).toEqual([{ lef_session: [] }, { oidc: [] }])
        expect(operation.responses['200']).toMatchObject({
            content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } },
            headers: { 'Content-Disposition': { description: 'attachment; filename="batch-verification-<uuid>.csv"' } },
        })
        expect(Object.keys(operation.responses).sort()).toEqual(['200', '400', '401', '403', '404'])
    })
})
