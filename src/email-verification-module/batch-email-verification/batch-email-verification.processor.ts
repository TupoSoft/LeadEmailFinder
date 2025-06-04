import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Job, Queue, WaitingChildrenError } from 'bullmq'
import { BatchEmailVerificationJobData } from './batch-email-verification-job-data.interface'
import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import { Inject, Logger } from '@nestjs/common'
import { ok } from 'node:assert'
import { PassThrough, Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'
import { parse, Parser } from 'csv-parse'
import { plainToInstance } from 'class-transformer'
import { BatchEmailVerificationCsvRowDto } from './batch-email-verification-csv-row.dto'
import { validate } from 'class-validator'
import { randomUUID } from 'node:crypto'
import { VerifyOptions } from '../../common'
import { InjectModel } from '@nestjs/mongoose'
import { EmailVerification } from '../sync-email-verification'
import { Model } from 'mongoose'
import { stringify } from 'csv-stringify'
import { Upload } from '@aws-sdk/lib-storage'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification.constants'

@Processor(BATCH_EMAIL_VERIFICATION_QUEUE_NAME)
export class BatchEmailVerificationProcessor extends WorkerHost {
    private readonly logger = new Logger(BatchEmailVerificationProcessor.name)

    constructor(
        @Inject(getS3ConnectionToken('default')) private readonly s3: S3,
        @InjectQueue('async-email-verification') private readonly asyncEmailVerificationQueue: Queue<VerifyOptions>,
        @InjectModel(EmailVerification.name) private readonly emailVerificationModel: Model<EmailVerification>,
    ) {
        super()
    }

    async process(job: Job<BatchEmailVerificationJobData, string>, token: string): Promise<string> {
        while (job.data.step !== BatchEmailVerificationJobStep.Finish) {
            switch (job.data.step) {
                case BatchEmailVerificationJobStep.Validate:
                    await this.validateFile(job)
                    break
                case BatchEmailVerificationJobStep.Process:
                    await this.processFile(job)
                    break
                case BatchEmailVerificationJobStep.WaitForChildren:
                    await this.waitForChildren(job, token)
                    break
                case BatchEmailVerificationJobStep.UploadResults:
                    await this.uploadResults(job)
                    break
                default:
                    this.handleDefault(job)
            }
        }

        const {
            data: { resultFilePath },
        } = job

        return resultFilePath
    }

    private async uploadResults(job: Job<BatchEmailVerificationJobData>): Promise<void> {
        ok(job.data.step === BatchEmailVerificationJobStep.UploadResults, 'Invalid step.')

        const { bucket, key } = job.data

        const cursor = this.emailVerificationModel.find<EmailVerification>({ batchId: job.id }).lean().cursor()
        const stringifier = stringify()
        const passThrough = new PassThrough()

        const upload = new Upload({
            client: this.s3,
            params: {
                Bucket: `${bucket}-results`,
                Key: key,
                Body: passThrough,
                ContentType: 'text/csv',
            },
        })

        cursor.pipe(stringifier).pipe(passThrough)

        try {
            await upload.done()
        } catch (error) {
            this.logger.error(error)
        }

        await job.updateData({
            step: BatchEmailVerificationJobStep.Finish,
            resultFilePath: `s3://${bucket}-results/${key}`,
        })
    }

    private async validateFile(job: Job<BatchEmailVerificationJobData>): Promise<void> {
        ok(job.data.step === BatchEmailVerificationJobStep.Validate, 'Invalid step.')

        const { bucket, key } = job.data

        const parser = await this.getParser(bucket, key)

        for await (const row of parser) {
            const csvRecord = plainToInstance(BatchEmailVerificationCsvRowDto, row)
            const errors = await validate(csvRecord)

            if (errors.length > 0) {
                throw new Error('Validation failed. ' + errors.map(error => error.toString()).join(','))
            }
        }

        await job.updateData({
            step: BatchEmailVerificationJobStep.Process,
            bucket,
            key,
        })
    }

    private async processFile(job: Job<BatchEmailVerificationJobData>): Promise<void> {
        ok(job.data.step === BatchEmailVerificationJobStep.Process, 'Invalid step.')
        ok(job.id, 'Job ID is undefined.')

        const { bucket, key } = job.data

        const parser = await this.getParser(bucket, key)

        for await (const row of parser) {
            const { email } = plainToInstance(BatchEmailVerificationCsvRowDto, row)

            await this.asyncEmailVerificationQueue.add(
                'async-email-verification',
                { email, batchId: job.id },
                {
                    jobId: randomUUID(),
                    parent: {
                        id: job.id,
                        queue: job.queueQualifiedName,
                    },
                },
            )
        }

        await job.updateData({
            step: BatchEmailVerificationJobStep.WaitForChildren,
            bucket,
            key,
        })
    }

    private async getParser(bucket: string, key: string): Promise<Parser> {
        const { Body } = await this.s3.getObject({ Bucket: bucket, Key: key })

        ok(Body, `Failed to get object from bucket ${bucket} with key ${key}.`)

        return Readable.fromWeb(Body.transformToWebStream() as ReadableStream).pipe(
            parse({
                skip_empty_lines: true,
                columns: true,
                trim: true,
            }),
        )
    }

    private async waitForChildren(job: Job<BatchEmailVerificationJobData>, token: string): Promise<void> {
        ok(job.data.step === BatchEmailVerificationJobStep.WaitForChildren, 'Invalid step.')
        const shouldWait = await job.moveToWaitingChildren(token)

        if (shouldWait) {
            throw new WaitingChildrenError()
        }

        const { bucket, key } = job.data

        await job.updateData({
            step: BatchEmailVerificationJobStep.UploadResults,
            bucket,
            key,
        })
    }

    private handleDefault(job: Job<BatchEmailVerificationJobData>): never {
        throw new Error(`Unknown step: ${String(job.data.step)}`)
    }
}
