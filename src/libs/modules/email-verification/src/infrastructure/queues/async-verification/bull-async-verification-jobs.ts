import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { IEmailVerificationResponseDto } from '@tuposoft/lead-email-finder/common'
import { Queue } from 'bullmq'
import type {
    AsyncVerificationJob,
    AsyncVerificationJobData,
    AsyncVerificationJobs,
} from '../../../application/delivery/async/async-verification-jobs'
import type { AsyncEmailVerificationJobData } from './async-email-verification-job-data.interface'
import { normalizeVerificationJobState } from '../normalize-verification-job-state'
import {
    ASYNC_EMAIL_VERIFICATION_JOB_NAME,
    ASYNC_EMAIL_VERIFICATION_QUEUE_NAME,
} from './async-email-verification-queue.config'

@Injectable()
export class BullAsyncVerificationJobs implements AsyncVerificationJobs {
    constructor(
        @InjectQueue(ASYNC_EMAIL_VERIFICATION_QUEUE_NAME)
        private readonly queue: Queue<
            AsyncEmailVerificationJobData,
            IEmailVerificationResponseDto,
            typeof ASYNC_EMAIL_VERIFICATION_JOB_NAME
        >,
    ) {}

    async enqueue(data: AsyncVerificationJobData, jobId: string): Promise<{ id?: string }> {
        const { email, organizationId, credentialId } = data
        const { id } = await this.queue.add(
            ASYNC_EMAIL_VERIFICATION_JOB_NAME,
            { email, organizationId, credentialId },
            { jobId },
        )
        return { id }
    }

    async find(id: string): Promise<AsyncVerificationJob | undefined> {
        const job = await this.queue.getJob(id)
        if (!job) return undefined

        return {
            organizationId: job.data.organizationId,
            readStatus: async () => {
                const state = await job.getState()
                if (state === 'completed') return { state: 'completed', result: job.returnvalue }
                return { state: normalizeVerificationJobState(state) }
            },
        }
    }
}
