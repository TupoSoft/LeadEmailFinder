import { Job, Queue } from 'bullmq'
import { Readable } from 'node:stream'
import { DataSource, Repository } from 'typeorm'
import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { S3 } from 'nestjs-s3'
import { BatchEmailVerificationProcessor } from './batch-email-verification.processor'
import { BatchEmailVerificationJobData } from './batch-email-verification-job-data.interface'
import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'
import { EmailVerification } from '../sync-email-verification'
import { AsyncEmailVerificationJobData } from '../async-email-verification/async-email-verification-job-data.interface'
import { BatchResultUploader } from './batch-result-uploader'

describe('BatchEmailVerificationProcessor', () => {
    let processor: BatchEmailVerificationProcessor
    let emailVerificationRepo: { createQueryBuilder: jest.Mock }
    let dataSource: { getMetadata: jest.Mock }
    let batchResultUploader: { startCsvUpload: jest.Mock }
    let uploadDone: jest.Mock
    let uploadAbort: jest.Mock

    beforeEach(() => {
        emailVerificationRepo = { createQueryBuilder: jest.fn() }
        dataSource = {
            getMetadata: jest.fn().mockReturnValue({
                columns: [{ propertyName: 'email' }, { propertyName: 'isValid' }],
            }),
        }
        uploadDone = jest.fn()
        uploadAbort = jest.fn().mockResolvedValue(undefined)
        batchResultUploader = { startCsvUpload: jest.fn() }
        batchResultUploader.startCsvUpload.mockImplementation(({ body }: { body: Readable }) => {
            uploadDone.mockImplementationOnce(async () => {
                await new Promise<void>((resolve, reject) => {
                    body.on('data', () => undefined)
                    body.once('end', resolve)
                    body.once('error', reject)
                })
            })

            return {
                done: uploadDone,
                abort: uploadAbort,
            }
        })

        processor = new BatchEmailVerificationProcessor(
            {} as S3,
            batchResultUploader as BatchResultUploader,
            {} as Queue<AsyncEmailVerificationJobData>,
            emailVerificationRepo as unknown as Repository<EmailVerification>,
            dataSource as unknown as DataSource,
            {} as CreditsService,
        )
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('publishes Finish only after the result upload succeeds', async () => {
        const cursor = Readable.from([{ email: 'person@example.com', isValid: true }])
        mockResultCursor(cursor)
        const job = makeUploadResultsJob()

        const result = await processor.process(job, 'token')

        expect(result).toBe('s3://batch-results/organizations/org-1/results/input.csv')
        expect(batchResultUploader.startCsvUpload).toHaveBeenCalledWith({
            bucket: 'batch-results',
            key: 'organizations/org-1/results/input.csv',
            body: expect.any(Readable),
        })
        expect(uploadDone).toHaveBeenCalledTimes(1)
        expect(job.updateData).toHaveBeenCalledWith({
            step: BatchEmailVerificationJobStep.Finish,
            resultFilePath: 's3://batch-results/organizations/org-1/results/input.csv',
            organizationId: 'org-1',
            credentialId: 'cred-1',
        })
    })

    it('rejects and does not publish Finish when the upload fails', async () => {
        const uploadError = new Error('S3 unavailable')
        mockResultCursor(Readable.from([{ email: 'person@example.com', isValid: true }]))
        uploadDone.mockReset().mockRejectedValueOnce(uploadError)
        const job = makeUploadResultsJob()

        await expect(processor.process(job, 'token')).rejects.toBe(uploadError)

        expect(job.updateData).not.toHaveBeenCalled()
        expect(uploadAbort).toHaveBeenCalledTimes(1)
        expect(job.data.step).toBe(BatchEmailVerificationJobStep.UploadResults)
    })

    it('rejects and does not publish Finish when the result cursor fails', async () => {
        const cursorError = new Error('cursor failed')
        const cursor = new Readable({
            read() {
                this.destroy(cursorError)
            },
        })
        mockResultCursor(cursor)
        const job = makeUploadResultsJob()

        await expect(processor.process(job, 'token')).rejects.toBe(cursorError)

        expect(job.updateData).not.toHaveBeenCalled()
        expect(uploadAbort).toHaveBeenCalledTimes(1)
    })

    function mockResultCursor(cursor: Readable): void {
        const queryBuilder = {
            where: jest.fn(),
            stream: jest.fn().mockResolvedValue(cursor),
        }
        queryBuilder.where.mockReturnValue(queryBuilder)
        emailVerificationRepo.createQueryBuilder.mockReturnValue(queryBuilder)
    }

    function makeUploadResultsJob(): Job<BatchEmailVerificationJobData, string> & { updateData: jest.Mock } {
        const job = {
            id: 'batch-1',
            data: {
                step: BatchEmailVerificationJobStep.UploadResults,
                bucket: 'batch-results',
                key: 'organizations/org-1/uploads/input.csv',
                organizationId: 'org-1',
                credentialId: 'cred-1',
            } as BatchEmailVerificationJobData,
            updateData: jest.fn((data: BatchEmailVerificationJobData) => {
                job.data = data
                return Promise.resolve()
            }),
        }

        return job as unknown as Job<BatchEmailVerificationJobData, string> & { updateData: jest.Mock }
    }
})
