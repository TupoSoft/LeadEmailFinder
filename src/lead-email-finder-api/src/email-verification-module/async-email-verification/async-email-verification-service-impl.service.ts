import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import {
    fromStringToEnum,
    IEmailVerificationResponseDto,
    JobState,
    VerifyOptions,
} from '@tuposoft/lead-email-finder/common'
import { randomUUID } from 'node:crypto'
import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'
import {
    AsyncEmailVerificationService,
    GetAsyncVerificationStatus,
    VerifyAsyncRequest,
    VerifyAsyncResponse,
} from './async-email-verification-service.interface'
import { ok } from 'node:assert'

@Injectable()
export class AsyncEmailVerificationServiceImpl implements AsyncEmailVerificationService {
    constructor(
        @InjectQueue('async-email-verification')
        private readonly queue: Queue<VerifyOptions, IEmailVerificationResponseDto, 'async-email-verification'>,
    ) {}

    async verifyAsync({ email }: VerifyAsyncRequest): Promise<VerifyAsyncResponse> {
        const { id } = await this.queue.add('async-email-verification', { email }, { jobId: randomUUID() })

        ok(
            id,
            `Failed to add job to queue. Job ID is undefined. Queue name: async-email-verification. Job data: ${email}`,
        )

        return { id }
    }

    async getAsyncVerificationState(id: string): Promise<GetAsyncVerificationStatus> {
        const job = await this.queue.getJob(id)

        ok(job, new AsyncEmailVerificationJobNotFoundException(id))

        const stateString = await job.getState()
        const state = fromStringToEnum(JobState, stateString)

        ok(state, `Unknown job state: ${stateString}. Job ID: ${id}. Job email: ${job.data.email}`)

        if (state !== JobState.COMPLETED) {
            return {
                state,
            }
        }

        const { returnvalue: result } = job

        return {
            state: state,
            result,
        }
    }
}
