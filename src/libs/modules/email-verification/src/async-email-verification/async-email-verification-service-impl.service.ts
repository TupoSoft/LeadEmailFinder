import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { fromStringToEnum, IEmailVerificationResponseDto, JobState } from '@tuposoft/lead-email-finder/common'
import { AuthPrincipal } from '@tuposoft/lead-email-finder/modules/identity'
import { randomUUID } from 'node:crypto'
import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'
import { AsyncEmailVerificationJobData } from './async-email-verification-job-data.interface'
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
        private readonly queue: Queue<AsyncEmailVerificationJobData, IEmailVerificationResponseDto, 'async-email-verification'>,
    ) {}

    async verifyAsync({ email }: VerifyAsyncRequest, principal: AuthPrincipal): Promise<VerifyAsyncResponse> {
        const { id } = await this.queue.add(
            'async-email-verification',
            { email, organizationId: principal.organizationId, credentialId: principal.credentialId },
            { jobId: randomUUID() },
        )

        ok(id, 'async_email_verification_job_id_missing')

        return { id }
    }

    async getAsyncVerificationState(id: string, principal: AuthPrincipal): Promise<GetAsyncVerificationStatus> {
        const job = await this.queue.getJob(id)

        ok(job, new AsyncEmailVerificationJobNotFoundException(id))
        ok(job.data.organizationId === principal.organizationId, new AsyncEmailVerificationJobNotFoundException(id))

        const stateString = await job.getState()
        const state = fromStringToEnum(JobState, stateString)

        ok(state, 'async_email_verification_state_unknown')

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
