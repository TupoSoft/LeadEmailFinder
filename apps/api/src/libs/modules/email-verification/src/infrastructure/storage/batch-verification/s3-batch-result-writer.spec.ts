import { Readable } from 'node:stream'
import { Test, TestingModule } from '@nestjs/testing'
import { getS3ConnectionToken } from 'nestjs-s3'
import { DataSource } from 'typeorm'
import { Upload } from '@aws-sdk/lib-storage'
import { CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, CustomerObjectWriteSecurity } from '@tuposoft/lead-email-finder/common'
import {
    CustomerObjectWriteSecurityMapping,
    customerObjectWriteSecurityContract,
} from '@tuposoft/lead-email-finder/common/testing'
import { S3BatchResultWriter } from './s3-batch-result-writer'

jest.mock('@aws-sdk/lib-storage')

interface UploadParams {
    Bucket: string
    Key: string
    Body: NodeJS.WritableStream
    CacheControl?: string
    ServerSideEncryption?: string
    SSEKMSKeyId?: string
}

const developmentObjectWriteSecurity: CustomerObjectWriteSecurity = {
    mode: 'development-local',
    cacheControl: 'no-store',
}

function readSecurityMapping(params: UploadParams): CustomerObjectWriteSecurityMapping {
    if ('ServerSideEncryption' in params || 'SSEKMSKeyId' in params) {
        return {
            cacheControl: params.CacheControl as 'no-store',
            serverSideEncryption: params.ServerSideEncryption as 'aws:kms',
            kmsKeyId: params.SSEKMSKeyId as string,
        }
    }

    return { cacheControl: params.CacheControl as 'no-store' }
}

function mockUploadDrivenByBody(
    onBody?: (body: NodeJS.WritableStream) => void,
    onUpload?: (params: UploadParams) => void,
): void {
    ;(Upload as unknown as jest.Mock).mockImplementation(({ params }: { params: UploadParams }) => {
        onUpload?.(params)
        onBody?.(params.Body)

        return {
            done: () =>
                new Promise((resolve, reject) => {
                    params.Body.on('finish', resolve)
                    params.Body.on('error', reject)
                }),
        }
    })
}

function mockUploadRejectingDirectly(error: Error): void {
    ;(Upload as unknown as jest.Mock).mockImplementation(() => ({
        done: () => Promise.reject(error),
    }))
}

function erroringCursor(error: Error): Readable {
    let emitted = false

    return new Readable({
        objectMode: true,
        read() {
            if (!emitted) {
                emitted = true
                process.nextTick(() => this.destroy(error))
            }
        },
    })
}

function rawRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        sourceRow: 1,
        originalEmail: 'person@lef.test',
        normalizedAddress: 'person@lef.test',
        firstSeenRow: 1,
        resultId: 'result-1',
        billingState: 'settled',
        chargedCount: 1,
        finalReason: 'conclusive',
        reason: 'accepted_email',
        sources: ['mx'],
        exists: true,
        catchAll: false,
        domain: 'lef.test',
        localPart: 'person',
        format: null,
        targetExchange: null,
        mxDomain: null,
        resultCreatedAt: new Date('2026-09-15T00:00:00.000Z'),
        verificationQuality: 'conclusive_positive',
        evidenceObservedAt: new Date('2026-09-15T00:00:00.000Z'),
        evidencePolicyVersion: 1,
        ...overrides,
    }
}

describe('S3BatchResultWriter', () => {
    let queryBuilder: {
        select: jest.Mock
        addSelect: jest.Mock
        from: jest.Mock
        innerJoin: jest.Mock
        leftJoin: jest.Mock
        where: jest.Mock
        andWhere: jest.Mock
        orderBy: jest.Mock
        stream: jest.Mock
    }

    beforeEach(() => {
        jest.clearAllMocks()
        queryBuilder = {
            select: jest.fn(),
            addSelect: jest.fn(),
            from: jest.fn(),
            innerJoin: jest.fn(),
            leftJoin: jest.fn(),
            where: jest.fn(),
            andWhere: jest.fn(),
            orderBy: jest.fn(),
            stream: jest.fn(),
        }
        for (const method of ['select', 'addSelect', 'from', 'innerJoin', 'leftJoin', 'where', 'andWhere', 'orderBy'] as const) {
            queryBuilder[method].mockReturnValue(queryBuilder)
        }
    })

    async function buildWriter(
        cursor: Readable,
        objectWriteSecurity: CustomerObjectWriteSecurity = developmentObjectWriteSecurity,
    ): Promise<S3BatchResultWriter> {
        queryBuilder.stream.mockResolvedValue(cursor)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                S3BatchResultWriter,
                { provide: getS3ConnectionToken('default'), useValue: {} },
                { provide: CUSTOMER_OBJECT_WRITE_SECURITY_TOKEN, useValue: objectWriteSecurity },
                { provide: DataSource, useValue: { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } },
            ],
        }).compile()

        return module.get(S3BatchResultWriter)
    }

    customerObjectWriteSecurityContract('batch result AWS upload adapter', {
        writeWithSecurity: async security => {
            let uploadParams: UploadParams | undefined
            mockUploadDrivenByBody(undefined, params => {
                uploadParams = params
            })
            const writer = await buildWriter(Readable.from([], { objectMode: true }), security)

            await writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')

            expect(uploadParams).toBeDefined()
            return readSecurityMapping(uploadParams as UploadParams)
        },
    })

    it('returns the exact result location after a successful upload', async () => {
        mockUploadDrivenByBody()
        const writer = await buildWriter(Readable.from([], { objectMode: true }))

        const result = await writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')

        expect(result).toEqual({ resultFilePath: 's3://bucket/organizations/org-1/results/file.csv' })
    })

    it('scopes the result cursor by both organization and batch id, ordered by source row', async () => {
        mockUploadDrivenByBody()
        const writer = await buildWriter(Readable.from([], { objectMode: true }))

        await writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')

        expect(queryBuilder.where).toHaveBeenCalledWith('row.batchId = :batchId', { batchId: 'job-1' })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('row.organizationId = :organizationId', { organizationId: 'org-1' })
        expect(queryBuilder.orderBy).toHaveBeenCalledWith('row.sourceRow', 'ASC')
    })

    it('rejects when the S3 upload rejects', async () => {
        mockUploadRejectingDirectly(new Error('upload failed'))
        const writer = await buildWriter(Readable.from([], { objectMode: true }))

        await expect(writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')).rejects.toThrow(
            'upload failed',
        )
    })

    it('rejects instead of hanging when the query cursor stream errors mid-read', async () => {
        mockUploadDrivenByBody()
        const writer = await buildWriter(erroringCursor(new Error('cursor failed')))

        await expect(writer.write('bucket', 'organizations/org-1/uploads/file.csv', 'org-1', 'job-1')).rejects.toThrow(
            'cursor failed',
        )
    })

    it('maps a settled conclusive row to a completed, charged, non-duplicate output row', async () => {
        const chunks: Buffer[] = []
        mockUploadDrivenByBody(body => body.on('data', (chunk: Buffer) => chunks.push(chunk)))
        const writer = await buildWriter(Readable.from([rawRow()], { objectMode: true }))

        await writer.write('bucket', 'key', 'org-1', 'job-1')

        const csv = Buffer.concat(chunks).toString('utf8')
        const [header, dataLine] = csv.trim().split('\n')
        const cells = dataLine.split(',')
        const columns = header.split(',')
        const record = Object.fromEntries(columns.map((column, index) => [column, cells[index]]))
        expect(record.verificationStatus).toBe('completed')
        expect(record.creditsCharged).toBe('1')
        expect(record.billingReason).toBe('conclusive')
        expect(record.duplicateOfRow).toBe('')
        expect(record.id).toBe('result-1')
    })

    it('zeroes the charge and reports duplicate for a later occurrence of the same address', async () => {
        const chunks: Buffer[] = []
        mockUploadDrivenByBody(body => body.on('data', (chunk: Buffer) => chunks.push(chunk)))
        const writer = await buildWriter(
            Readable.from([rawRow({ sourceRow: 3, firstSeenRow: 1, chargedCount: 1, finalReason: 'conclusive' })], {
                objectMode: true,
            }),
        )

        await writer.write('bucket', 'key', 'org-1', 'job-1')

        const csv = Buffer.concat(chunks).toString('utf8')
        expect(csv).toContain(',duplicate\n')
        expect(csv.split('\n')[1]).toMatch(/^result-1,person@lef\.test,person@lef\.test,3,1,/)
    })

    it('reports a pending row still awaiting settlement as processing with no charge yet', async () => {
        const chunks: Buffer[] = []
        mockUploadDrivenByBody(body => body.on('data', (chunk: Buffer) => chunks.push(chunk)))
        const writer = await buildWriter(
            Readable.from(
                [
                    rawRow({
                        resultId: null,
                        billingState: 'pending',
                        chargedCount: 0,
                        finalReason: null,
                        reason: null,
                        sources: null,
                        exists: null,
                        catchAll: null,
                        domain: null,
                        localPart: null,
                        resultCreatedAt: null,
                        verificationQuality: null,
                        evidenceObservedAt: null,
                        evidencePolicyVersion: null,
                    }),
                ],
                { objectMode: true },
            ),
        )

        await writer.write('bucket', 'key', 'org-1', 'job-1')

        const csv = Buffer.concat(chunks).toString('utf8')
        expect(csv).toContain('processing')
        expect(csv).toContain('pending')
    })

    it('reports a settled row with no result as failed', async () => {
        const chunks: Buffer[] = []
        mockUploadDrivenByBody(body => body.on('data', (chunk: Buffer) => chunks.push(chunk)))
        const writer = await buildWriter(
            Readable.from(
                [
                    rawRow({
                        resultId: null,
                        billingState: 'settled',
                        chargedCount: 0,
                        finalReason: 'failed',
                        reason: null,
                        sources: null,
                        exists: null,
                        catchAll: null,
                    }),
                ],
                { objectMode: true },
            ),
        )

        await writer.write('bucket', 'key', 'org-1', 'job-1')

        const csv = Buffer.concat(chunks).toString('utf8')
        expect(csv).toContain('failed')
    })

    it('neutralizes untrusted customer text before quoting while preserving trusted enum/status cells', async () => {
        const chunks: Buffer[] = []
        mockUploadDrivenByBody(body => body.on('data', (chunk: Buffer) => chunks.push(chunk)))
        const writer = await buildWriter(
            Readable.from(
                [
                    rawRow({
                        originalEmail: '=SUM(1,2)@lef.test',
                        normalizedAddress: '=sum(1,2)@lef.test',
                        domain: '+lef.test',
                        localPart: '-person',
                    }),
                ],
                { objectMode: true },
            ),
        )

        await writer.write('bucket', 'key', 'org-1', 'job-1')

        const csv = Buffer.concat(chunks).toString('utf8')
        expect(csv).toContain(`"'=SUM(1,2)@lef.test"`)
        expect(csv).toContain(`"'=sum(1,2)@lef.test"`)
        expect(csv).toContain(`'+lef.test`)
        expect(csv).toContain(`'-person`)
        // Trusted system-generated fields are never escaped even though they are plain strings.
        expect(csv).toContain(',completed,')
        expect(csv).toContain(',conclusive\n')
    })
})
