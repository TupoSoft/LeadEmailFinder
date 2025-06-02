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

@Injectable()
export class BatchEmailVerificationServiceImpl implements BatchEmailVerificationService {
    constructor(
        @InjectQueue('batch-email-verification')
        private readonly batchEmailVerificationQueue: Queue<BatchEmailVerificationJobData>,
    ) {}

    async getBatchStatus(id: string): Promise<GetBatchStatusResponse> {
        const job = await this.batchEmailVerificationQueue.getJob(id)

        if (job === undefined) {
            throw new JobNotFoundException(id)
        }

        const state = await job.getState()
        const status = fromStringToEnum(JobState, state) ?? JobState.UNKNOWN

        const progress = await this.calculateProgress(job)

        return {
            id,
            status,
            progress,
        }
    }

    private async calculateProgress(job: Job<BatchEmailVerificationJobData>): Promise<number> {
        const {
            data: { step },
        } = job

        if (step === BatchEmailVerificationJobStep.Validate || step === BatchEmailVerificationJobStep.Process) {
            return 0
        }

        const { processed, unprocessed } = await job.getDependenciesCount()

        if (processed === undefined || unprocessed === undefined) {
            return 0
        }

        return (processed / unprocessed) * 100
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
