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
import { BatchAdmissionStore } from './batch-admission-store'
import { BatchResultReader, BatchResultUnavailableError } from './batch-result-reader'
import { BatchEmailVerificationJobNotFoundException } from './job-not-found.exception'
import { VerificationJobState } from '../verification-job-state'
import { BatchTerminalFailureCode } from './batch-terminal-failure'
import { getDownloadableBatchResultLocation, mapBatchVerificationStatus } from './batch-verification-status'

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

export interface BatchStatusAddressCounts {
    readonly totalRows: number
    readonly uniqueAddresses: number
    readonly duplicateRows: number
    readonly cachedAddresses: number
    readonly sharedAddresses: number
    readonly cooldownAddresses: number
    readonly completedAddresses: number
    readonly conclusiveAddresses: number
    readonly inconclusiveAddresses: number
    readonly failedAddresses: number
}

export interface BatchStatusBilling {
    readonly state: 'pending' | 'settled'
    readonly reserved: number
    readonly charged: number
}

export interface GetBatchStatusResponse {
    id: string
    status: VerificationJobState
    failureCode?: BatchTerminalFailureCode
    total: number
    processed: number
    unprocessed: number
    progress: number
    resultsAvailable: boolean
    counts: BatchStatusAddressCounts
    billing: BatchStatusBilling
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

export class BatchEmailVerificationService {
    constructor(
        private readonly jobs: BatchJobs,
        private readonly resultReader: BatchResultReader,
        private readonly admissions: BatchAdmissionStore,
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

        const snapshot = await job.readStatus()
        const status = mapBatchVerificationStatus(snapshot)
        const stats = await this.getStats(job)
        if (status.status === 'completed') stats.progress = 100

        const admission = await this.admissions.findById(id, organizationId)
        const addressCounts = admission ? await this.admissions.getStatusCounts(id, organizationId) : null

        const counts: BatchStatusAddressCounts = {
            totalRows: admission?.totalRows ?? 0,
            uniqueAddresses: admission?.uniqueAddressCount ?? 0,
            duplicateRows: admission ? Math.max(0, admission.totalRows - admission.uniqueAddressCount) : 0,
            cachedAddresses: addressCounts?.cachedAddresses ?? 0,
            sharedAddresses: addressCounts?.sharedAddresses ?? 0,
            cooldownAddresses: addressCounts?.cooldownAddresses ?? 0,
            completedAddresses: addressCounts?.completedAddresses ?? 0,
            conclusiveAddresses: addressCounts?.conclusiveAddresses ?? 0,
            inconclusiveAddresses: addressCounts?.inconclusiveAddresses ?? 0,
            failedAddresses: addressCounts?.failedAddresses ?? 0,
        }
        const billing: BatchStatusBilling = {
            state:
                admission !== null && admission.uniqueAddressCount > 0 && counts.completedAddresses >= admission.uniqueAddressCount
                    ? 'settled'
                    : 'pending',
            reserved: addressCounts?.reserved ?? 0,
            charged: addressCounts?.charged ?? 0,
        }
        const resultsAvailable = getDownloadableBatchResultLocation(snapshot) !== undefined

        return { id, ...status, ...stats, resultsAvailable, counts, billing }
    }

    async getBatchResults(id: string, organizationId: string): Promise<Readable> {
        const job = await this.jobs.find(id)

        ok(job, new BatchEmailVerificationJobNotFoundException(id))
        ok(job.data.organizationId === organizationId, new BatchEmailVerificationJobNotFoundException(id))

        const resultLocation = getDownloadableBatchResultLocation(await job.readStatus())
        if (resultLocation === undefined) {
            throw new BatchEmailVerificationJobNotFoundException(id)
        }

        try {
            return await this.resultReader.read(resultLocation)
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
            case BatchJobStep.Admit:
            case BatchJobStep.Dispatch:
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
