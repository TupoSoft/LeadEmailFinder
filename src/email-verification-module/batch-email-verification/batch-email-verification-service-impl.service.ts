import { Injectable } from '@nestjs/common'
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
import { JobState } from './job-state.enum'
import { fromStringToEnum } from '../../common'
import { Readable } from 'stream'

@Injectable()
export class BatchEmailVerificationServiceImpl implements BatchEmailVerificationService {
    constructor(
        @InjectQueue('batch-email-verification')
        private readonly batchEmailVerificationQueue: Queue<BatchEmailVerificationJobData>,
    ) {}

    getBatchResults(id: string): Promise<Readable> {
        throw new Error('Method not implemented.')
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

    async uploadFile({ bucket, key }: BatchEmailVerificationFile): Promise<EnqueueBatchResponse> {
        const batchEmailVerificationJob = await this.batchEmailVerificationQueue.add(
            'batch-email-verification',
            {
                step: BatchEmailVerificationJobStep.Validate,
                bucket,
                key,
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
