import { Inject, Injectable } from '@nestjs/common'
import { Job, Queue } from 'bullmq'
import { InjectQueue } from '@nestjs/bullmq'
import { randomUUID } from 'node:crypto'
import { BatchEmailVerificationJobStep } from './batch-email-verification-job-step.enum'
import { ok } from 'node:assert'
import { BatchEmailVerificationFile } from './batch-email-verification-file.interface'
import { BatchEmailVerificationJobData } from './batch-email-verification-job-data.interface'
import {
    BatchEmailVerificationService,
    EnqueueBatchResponse,
    GetBatchStatusResponse,
} from './batch-email-verification-service.interface'
import { JobNotFoundException } from './job-not-found.exception'
import { fromStringToEnum, JobState } from '@tuposoft/lead-email-finder/common'
import { Readable } from 'stream'
import { BATCH_EMAIL_VERIFICATION_QUEUE_NAME } from './batch-email-verification.constants'
import { getS3ConnectionToken, S3 } from 'nestjs-s3'
import { ReadableStream } from 'node:stream/web'

@Injectable()
export class BatchEmailVerificationServiceImpl implements BatchEmailVerificationService {
    constructor(
        @InjectQueue(BATCH_EMAIL_VERIFICATION_QUEUE_NAME)
        private readonly batchEmailVerificationQueue: Queue<BatchEmailVerificationJobData, string>,
        @Inject(getS3ConnectionToken('default')) private readonly s3: S3,
    ) {}

    async getBatchResults(id: string): Promise<Readable> {
        const job = await this.batchEmailVerificationQueue.getJob(id)

        ok(job, new JobNotFoundException(id))

        const state = await job.getState()
        const status = fromStringToEnum(JobState, state) ?? JobState.UNKNOWN

        ok(status === JobState.COMPLETED, `Job ${id} is not completed. Current state: ${status}`)

        const { returnvalue: result } = job

        const { hostname: Bucket, pathname: Key } = new URL(result)

        const { Body } = await this.s3.getObject({ Bucket, Key })

        ok(Body, `Failed to get object from bucket ${Bucket} with key ${Key}.`)

        return Readable.fromWeb(Body.transformToWebStream() as ReadableStream)
    }

    async getBatchStatus(id: string): Promise<GetBatchStatusResponse> {
        const job = await this.batchEmailVerificationQueue.getJob(id)

        if (job === undefined) {
            throw new JobNotFoundException(id)
        }

        const state = await job.getState()
        const status = fromStringToEnum(JobState, state) ?? JobState.UNKNOWN

        const stats = await this.getStats(job)

        return {
            id,
            status,
            ...stats,
        }
    }

    private async getStats(
        job: Job<BatchEmailVerificationJobData>,
    ): Promise<{ total: number; processed: number; unprocessed: number; progress: number }> {
        const {
            data: { step },
        } = job

        const { processed = 0, unprocessed = 0 } = await job.getDependenciesCount()

        const stats = {
            total: processed + unprocessed,
            processed,
            unprocessed,
            progress: 0,
        }

        if (step === BatchEmailVerificationJobStep.Validate || step === BatchEmailVerificationJobStep.Process) {
            return stats
        }

        stats.progress = (processed / unprocessed) * 100

        return stats
    }

    async uploadFile({ bucket, key }: BatchEmailVerificationFile, apiKey: string): Promise<EnqueueBatchResponse> {
        const batchEmailVerificationJob = await this.batchEmailVerificationQueue.add(
            BATCH_EMAIL_VERIFICATION_QUEUE_NAME,
            {
                step: BatchEmailVerificationJobStep.Validate,
                bucket,
                key,
                apiKey,
            },
            { jobId: randomUUID() },
        )

        const { id } = batchEmailVerificationJob

        ok(id, 'Failed to add job to queue. Job ID is undefined. Queue name: batch-email-verification.')

        return {
            id,
        }
    }
}
