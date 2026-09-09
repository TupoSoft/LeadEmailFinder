import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { ok } from 'node:assert'
import { safeErrorType } from '@tuposoft/lead-email-finder/common'
import {
    NOOP_VERIFICATION_TRACE_OBSERVER,
    observeSafely,
    VerificationTraceObserver,
} from '../../verification-trace/verification-trace-observer'
import { BatchJobStep } from '../../../domain/batch-job'
import { BatchJobs } from './batch-jobs'
import { BatchResultReader, BatchResultUnavailableError } from './batch-result-reader'
import { BatchEmailVerificationJobNotFoundException } from './job-not-found.exception'
import { VerificationJobState } from '../verification-job-state'
import { BatchTerminalFailureCode } from './batch-terminal-failure'
import { mapBatchVerificationStatus } from './batch-verification-status'

export const BATCH_EMAIL_VERIFICATION_SERVICE_TOKEN = 'BatchEmailVerificationServiceToken'

export interface EnqueueBatchInput {
    bucket: string
    key: string
    organizationId: string
    credentialId: string
}

export interface EnqueueBatchResponse {
    id: string
}

export interface GetBatchStatusResponse {
    id: string
    status: VerificationJobState
    failureCode?: BatchTerminalFailureCode
    total: number
    processed: number
    unprocessed: number
    progress: number
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

export class BatchEmailVerificationService {
    constructor(
        private readonly jobs: BatchJobs,
        private readonly resultReader: BatchResultReader,
        private readonly traceObserver: VerificationTraceObserver = NOOP_VERIFICATION_TRACE_OBSERVER,
    ) {}

    async uploadFile(
        { bucket, key, organizationId, credentialId }: EnqueueBatchInput,
        requestId: string = randomUUID(),
    ): Promise<EnqueueBatchResponse> {
        const startedAt = Date.now()
        const jobId = randomUUID()

        try {
            const { id } = await this.jobs.enqueue(
                { step: BatchJobStep.Validate, bucket, key, organizationId, credentialId },
                jobId,
            )

            ok(id, 'Failed to add job to queue. Job ID is undefined. Queue name: batch-email-verification.')
            observeSafely(() => this.traceObserver.enqueued({ requestId, mode: 'batch', jobId: id }))

            return { id }
        } catch (error) {
            observeSafely(() =>
                this.traceObserver.failed({
                    operationId: requestId,
                    mode: 'batch',
                    jobId,
                    batchId: jobId,
                    stage: 'queue_dispatch',
                    errorType: safeErrorType(error),
                    durationMs: Date.now() - startedAt,
                }),
            )
            throw error
        }
    }

    async getBatchStatus(id: string, organizationId: string): Promise<GetBatchStatusResponse> {
        const job = await this.jobs.find(id)

        if (job === undefined || job.data.organizationId !== organizationId) {
            throw new BatchEmailVerificationJobNotFoundException(id)
        }

        const status = mapBatchVerificationStatus(await job.readStatus())
        const stats = await this.getStats(job)
        if (status.status === 'completed') stats.progress = 100

        return { id, ...status, ...stats }
    }

    async getBatchResults(id: string, organizationId: string): Promise<Readable> {
        const job = await this.jobs.find(id)

        ok(job, new BatchEmailVerificationJobNotFoundException(id))
        ok(job.data.organizationId === organizationId, new BatchEmailVerificationJobNotFoundException(id))

        const snapshot = await job.readStatus()
        if (mapBatchVerificationStatus(snapshot).status !== 'completed' || !snapshot.resultLocation) {
            throw new BatchEmailVerificationJobNotFoundException(id)
        }

        try {
            return await this.resultReader.read(snapshot.resultLocation)
        } catch (error) {
            if (error instanceof BatchResultUnavailableError) throw new BatchEmailVerificationJobNotFoundException(id)
            throw error
        }
    }

    private async getStats(
        job: Awaited<ReturnType<BatchJobs['find']>> & object,
    ): Promise<{ total: number; processed: number; unprocessed: number; progress: number }> {
        const { step } = job.data
        const counts = await job.counts()
        const boundedCount = (value: number): number =>
            Number.isFinite(value) ? clamp(Math.floor(value), 0, Math.floor(Number.MAX_SAFE_INTEGER / 2)) : 0
        const processed = boundedCount(counts.processed)
        const unprocessed = boundedCount(counts.unprocessed)
        const total = processed + unprocessed

        const stats = { total, processed, unprocessed, progress: 0 }

        switch (step) {
            case BatchJobStep.Validate:
            case BatchJobStep.Process:
                return stats
            case BatchJobStep.Finish:
                stats.progress = 100
                return stats
            default:
                stats.progress = total > 0 ? clamp((processed / total) * 100, 0, 100) : 100
                return stats
        }
    }
}
