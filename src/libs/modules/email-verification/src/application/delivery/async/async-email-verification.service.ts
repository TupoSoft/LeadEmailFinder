import { ok } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { safeErrorType } from '@tuposoft/lead-email-finder/common'
import {
    NOOP_VERIFICATION_TRACE_OBSERVER,
    observeSafely,
    VerificationTraceObserver,
} from '../../verification-trace/verification-trace-observer'
import { AsyncVerificationJobData, AsyncVerificationJobs } from './async-verification-jobs'
import { AsyncEmailVerificationJobNotFoundException } from './job-not-found.exception'
import { AsyncVerificationStatus, mapAsyncVerificationStatus } from './async-verification-status'

export const ASYNC_EMAIL_VERIFICATION_SERVICE_TOKEN = 'AsyncEmailVerificationServiceToken'

export interface EnqueueAsyncVerification extends AsyncVerificationJobData {
    requestId?: string
}

export class AsyncEmailVerificationService {
    constructor(
        private readonly jobs: AsyncVerificationJobs,
        private readonly traceObserver: VerificationTraceObserver = NOOP_VERIFICATION_TRACE_OBSERVER,
    ) {}

    async verifyAsync({
        email,
        organizationId,
        credentialId,
        requestId = randomUUID(),
    }: EnqueueAsyncVerification): Promise<{ id: string }> {
        const startedAt = Date.now()
        const jobId = randomUUID()

        try {
            const { id } = await this.jobs.enqueue({ email, organizationId, credentialId }, jobId)

            ok(id, 'async_email_verification_job_id_missing')
            observeSafely(() => this.traceObserver.enqueued({ requestId, mode: 'async', jobId: id }))

            return { id }
        } catch (error) {
            observeSafely(() =>
                this.traceObserver.failed({
                    operationId: requestId,
                    mode: 'async',
                    jobId,
                    stage: 'queue_dispatch',
                    errorType: safeErrorType(error),
                    durationMs: Date.now() - startedAt,
                }),
            )
            throw error
        }
    }

    async getAsyncVerificationState(id: string, organizationId: string): Promise<AsyncVerificationStatus> {
        const job = await this.jobs.find(id)

        ok(job, new AsyncEmailVerificationJobNotFoundException(id))
        ok(job.organizationId === organizationId, new AsyncEmailVerificationJobNotFoundException(id))

        return mapAsyncVerificationStatus(await job.readStatus())
    }
}
