import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq'
import { Job, Queue, WaitingChildrenError } from 'bullmq'
import { BatchEmailVerificationJobData } from './batch-email-verification-job-data.interface'
import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import { Inject } from '@nestjs/common'
import { ok } from 'node:assert'
import { Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'
import { parse, Parser } from 'csv-parse'
import { plainToInstance } from 'class-transformer'
import { BatchEmailVerificationCsvRowDto } from './batch-email-verification-csv-row.dto'
import { validate } from 'class-validator'
import { randomUUID } from 'node:crypto'
import { VerifyOptions } from '../../common'

@Processor('batch-email-verification')
export class BatchEmailVerificationProcessor extends WorkerHost {
    constructor(
        @Inject(getS3ConnectionToken('default')) private readonly s3: S3,
        @InjectQueue('async-email-verification') private readonly asyncEmailVerificationQueue: Queue<VerifyOptions>,
    ) {
        super()
    }

    async process(job: Job<BatchEmailVerificationJobData>, token: string): Promise<any> {
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
                default:
                    this.handleDefault(job)
            }
        }
    }

    private async validateFile(job: Job<BatchEmailVerificationJobData>): Promise<void> {
        ok(job.data.step === BatchEmailVerificationJobStep.Validate, 'Invalid step.')

        const { bucket, key } = job.data

        const parser = await this.getParser(bucket, key)

        for await (const row of parser) {
            const csvRecord = plainToInstance(BatchEmailVerificationCsvRowDto, row)
            const errors = await validate(csvRecord)

            if (errors.length > 0) {
                await job.updateData({
                    step: BatchEmailVerificationJobStep.Finish,
                })
            }
        }

        await job.updateData({
            step: BatchEmailVerificationJobStep.Process,
            bucket,
            key,
        })
    }

    private async processFile(job: Job<BatchEmailVerificationJobData>): Promise<void> {
        ok(job.id, 'Job ID is undefined.')
        ok(job.data.step === BatchEmailVerificationJobStep.Process, 'Invalid step.')

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
        const shouldWait = await job.moveToWaitingChildren(token)

        if (shouldWait) {
            throw new WaitingChildrenError()
        }

        await job.updateData({
            step: BatchEmailVerificationJobStep.Finish,
        })
    }

    private handleDefault(job: Job<BatchEmailVerificationJobData>): never {
        throw new Error(`Unknown step: ${String(job.data.step)}`)
    }
}
