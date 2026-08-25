import { Test, TestingModule } from '@nestjs/testing'
import { BatchEmailVerificationServiceImpl } from './batch-email-verification-service-impl.service'
import { getQueueToken } from '@nestjs/bullmq'
import { getS3ConnectionToken } from 'nestjs-s3'
import { JobNotFoundException } from './job-not-found.exception'
import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { BatchEmailVerificationFile } from './batch-email-verification-file.interface'
import { randomUUID } from 'node:crypto'

const file: BatchEmailVerificationFile = {
    bucket: 'bucket',
    key: 'key',
    acl: 'private',
    contentType: 'text/csv',
    contentDisposition: null,
    storageClass: 'STANDARD',
    serverSideEncryption: null,
    metadata: {},
    location: 'https://bucket.s3.amazonaws.com/key',
    etag: 'etag',
    mimetype: 'text/csv',
    size: 0,
}

describe('BatchEmailVerificationService', () => {
    let service: BatchEmailVerificationServiceImpl
    let queue: { getJob: jest.Mock; add: jest.Mock }
    let s3: { getObject: jest.Mock }

    const principal = { organizationId: 'org-1', credentialId: 'cred-1' } as AuthPrincipal
    const otherPrincipal = { organizationId: 'org-2', credentialId: 'cred-2' } as AuthPrincipal

    beforeEach(async () => {
        queue = { getJob: jest.fn(), add: jest.fn() }
        s3 = { getObject: jest.fn() }

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BatchEmailVerificationServiceImpl,
                {
                    provide: getQueueToken('batch-email-verification'),
                    useValue: queue,
                },
                {
                    provide: getQueueToken('async-email-verification'),
                    useValue: null,
                },
                {
                    provide: getS3ConnectionToken('default'),
                    useValue: s3,
                },
            ],
        }).compile()

        service = module.get(BatchEmailVerificationServiceImpl)
    })

    it('should be defined', () => {
        expect(service).toBeDefined()
    })

    describe('uploadFile', () => {
        it('enqueues a job scoped to the caller organization and credential', async () => {
            queue.add.mockResolvedValueOnce({ id: 'job-1' })

            const result = await service.uploadFile(file, principal)

            expect(result).toEqual({ id: 'job-1' })
            expect(queue.add).toHaveBeenCalledWith(
                'batch-email-verification',
                expect.objectContaining({
                    step: BatchEmailVerificationJobStep.Validate,
                    bucket: 'bucket',
                    key: 'key',
                    organizationId: 'org-1',
                    credentialId: 'cred-1',
                }),
                expect.objectContaining({ jobId: expect.any(String) }),
            )
        })
    })

    describe('getBatchStatus', () => {
        it('throws JobNotFoundException when the job does not exist', async () => {
            queue.getJob.mockResolvedValueOnce(undefined)

            await expect(service.getBatchStatus(randomUUID(), principal)).rejects.toThrow(JobNotFoundException)
        })

        it('throws JobNotFoundException when the job belongs to another organization', async () => {
            queue.getJob.mockResolvedValueOnce({
                data: { organizationId: 'org-1', step: BatchEmailVerificationJobStep.Validate },
                getState: jest.fn().mockResolvedValue('active'),
                getDependenciesCount: jest.fn().mockResolvedValue({}),
            })

            await expect(service.getBatchStatus(randomUUID(), otherPrincipal)).rejects.toThrow(JobNotFoundException)
        })

        it('returns status for a job owned by the caller organization', async () => {
            const id = randomUUID()

            queue.getJob.mockResolvedValueOnce({
                data: { organizationId: 'org-1', step: BatchEmailVerificationJobStep.Validate },
                getState: jest.fn().mockResolvedValue('active'),
                getDependenciesCount: jest.fn().mockResolvedValue({ processed: 0, unprocessed: 0 }),
            })

            const status = await service.getBatchStatus(id, principal)

            expect(status).toEqual(
                expect.objectContaining({
                    id,
                    total: 0,
                    processed: 0,
                    unprocessed: 0,
                }),
            )
        })

        it.each([
            ['before children exist, Validate', BatchEmailVerificationJobStep.Validate, 0, 0, 0],
            ['before children exist, Process', BatchEmailVerificationJobStep.Process, 0, 0, 0],
            ['no children processed yet', BatchEmailVerificationJobStep.WaitForChildren, 0, 10, 0],
            ['some children processed', BatchEmailVerificationJobStep.WaitForChildren, 8, 2, 80],
            ['all children processed, not Infinity', BatchEmailVerificationJobStep.WaitForChildren, 10, 0, 100],
            ['empty batch at upload stage', BatchEmailVerificationJobStep.UploadResults, 0, 0, 100],
            ['finish with no children', BatchEmailVerificationJobStep.Finish, 0, 0, 100],
            ['finish always reports 100 regardless of counts', BatchEmailVerificationJobStep.Finish, 5, 5, 100],
            [
                'defensive: inconsistent negative counts never escape as NaN/Infinity',
                BatchEmailVerificationJobStep.WaitForChildren,
                -1,
                -1,
                100,
            ],
        ])('reports bounded progress: %s', async (_description, step, processed, unprocessed, expectedProgress) => {
            const id = randomUUID()

            queue.getJob.mockResolvedValueOnce({
                data: { organizationId: 'org-1', step },
                getState: jest.fn().mockResolvedValue('active'),
                getDependenciesCount: jest.fn().mockResolvedValue({ processed, unprocessed }),
            })

            const status = await service.getBatchStatus(id, principal)

            expect(status.progress).toBe(expectedProgress)
            expect(Number.isFinite(status.progress)).toBe(true)
            expect(status.progress).toBeGreaterThanOrEqual(0)
            expect(status.progress).toBeLessThanOrEqual(100)
        })
    })

    describe('getBatchResults', () => {
        it('throws JobNotFoundException when the job does not exist', async () => {
            queue.getJob.mockResolvedValueOnce(undefined)

            await expect(service.getBatchResults(randomUUID(), principal)).rejects.toThrow(JobNotFoundException)
        })

        it('throws JobNotFoundException when the job belongs to another organization', async () => {
            queue.getJob.mockResolvedValueOnce({
                data: { organizationId: 'org-1' },
                getState: jest.fn().mockResolvedValue('completed'),
            })

            await expect(service.getBatchResults(randomUUID(), otherPrincipal)).rejects.toThrow(JobNotFoundException)
        })

        it('throws when the job is owned by the caller but not completed', async () => {
            queue.getJob.mockResolvedValueOnce({
                data: { organizationId: 'org-1' },
                getState: jest.fn().mockResolvedValue('active'),
            })

            await expect(service.getBatchResults(randomUUID(), principal)).rejects.toThrow()
        })

        it('streams results for a completed job owned by the caller organization', async () => {
            const webStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('email\n'))
                    controller.close()
                },
            })

            queue.getJob.mockResolvedValueOnce({
                data: { organizationId: 'org-1' },
                getState: jest.fn().mockResolvedValue('completed'),
                returnvalue: 's3://bucket/organizations/org-1/results/result.csv',
            })
            s3.getObject.mockResolvedValueOnce({ Body: { transformToWebStream: () => webStream } })

            const readable = await service.getBatchResults(randomUUID(), principal)

            expect(readable).toBeDefined()
            expect(s3.getObject).toHaveBeenCalledWith({
                Bucket: 'bucket',
                Key: 'organizations/org-1/results/result.csv',
            })
        })

        it.each(['not a URL', 'https://bucket/result.csv', 's3://bucket/'])(
            'rejects malformed result location %s without requesting S3',
            async returnvalue => {
                queue.getJob.mockResolvedValueOnce({
                    data: { organizationId: 'org-1' },
                    getState: jest.fn().mockResolvedValue('completed'),
                    returnvalue,
                })

                await expect(service.getBatchResults(randomUUID(), principal)).rejects.toThrow(
                    'Invalid S3 result location',
                )

                expect(s3.getObject).not.toHaveBeenCalled()
            },
        )
    })
})
