import { safeErrorType } from '@tuposoft/lead-email-finder/common'
import { ok } from 'node:assert'
import { BatchJobStep } from '../../../domain/batch-job'
import {
    NOOP_VERIFICATION_TRACE_OBSERVER,
    observeSafely,
    VerificationFailureStage,
    VerificationTraceObserver,
} from '../../verification-trace/verification-trace-observer'
import { VerificationExecutionDispatcher } from '../../ports/verification-execution-dispatcher'
import { BatchJobHandle } from './batch-jobs'
import { BatchAdmissionStore } from './batch-admission-store'
import { BatchAdmissionService } from './batch-admission.service'
import { BatchInput } from './batch-input'
import { BatchRowStore } from './batch-row-store'
import { BatchResultWriter } from './batch-result-writer'
import { BatchAwaitingSettlementSignal } from './batch-awaiting-settlement.signal'

const ROW_PAGE_SIZE = 500
const DISPATCH_PAGE_SIZE = 100
const DEFAULT_POLL_INTERVAL_MS = 5_000

export class BatchEmailVerificationWorkflow {
    constructor(
        private readonly input: BatchInput,
        private readonly rows: BatchRowStore,
        private readonly admissions: BatchAdmissionStore,
        private readonly admissionService: BatchAdmissionService,
        private readonly dispatcher: VerificationExecutionDispatcher,
        private readonly resultWriter: BatchResultWriter,
        private readonly traceObserver: VerificationTraceObserver = NOOP_VERIFICATION_TRACE_OBSERVER,
        private readonly pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
    ) {}

    async advance(job: BatchJobHandle, token: string): Promise<string> {
        const startedAt = Date.now()
        let stage: VerificationFailureStage = 'batch_validation'

        try {
            while (job.data.step !== BatchJobStep.Finish) {
                switch (job.data.step) {
                    case BatchJobStep.Validate:
                        stage = 'batch_validation'
                        await this.validateFile(job)
                        break
                    case BatchJobStep.Admit:
                        stage = 'queue_dispatch'
                        await this.admitBatch(job)
                        break
                    case BatchJobStep.Dispatch:
                        stage = 'queue_dispatch'
                        await this.dispatchExecutions(job)
                        break
                    case BatchJobStep.AwaitSettlement:
                        stage = 'queue_dispatch'
                        await this.awaitSettlement(job, token)
                        break
                    case BatchJobStep.UploadResults:
                        stage = 'batch_result_publication'
                        await this.uploadResults(job)
                        break
                }
            }

            await this.traceCompletion(job, startedAt)

            ok(job.data.step === BatchJobStep.Finish, 'Invalid step.')
            return job.data.resultFilePath
        } catch (error) {
            if (!(error instanceof BatchAwaitingSettlementSignal)) {
                observeSafely(() =>
                    this.traceObserver.failed({
                        operationId: job.id,
                        mode: 'batch',
                        jobId: job.id,
                        batchId: job.id,
                        attempt: Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, job.attemptsMade + 1)),
                        stage,
                        errorType: safeErrorType(error),
                        durationMs: Date.now() - startedAt,
                    }),
                )
            }
            throw error
        }
    }

    private async traceCompletion(job: BatchJobHandle, startedAt: number): Promise<void> {
        try {
            const { processed = 0, unprocessed = 0 } = await job.counts()
            const boundedCount = (count: number): number =>
                Number.isFinite(count) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(count))) : 0
            const processedCount = boundedCount(processed)
            const unprocessedCount = boundedCount(unprocessed)
            this.traceObserver.batchCompleted({
                batchId: job.id,
                total: boundedCount(processedCount + unprocessedCount),
                processed: processedCount,
                unprocessed: unprocessedCount,
                durationMs: Date.now() - startedAt,
            })
        } catch {
            // Reading observational counts or publishing telemetry cannot fail a completed batch.
        }
    }

    private async uploadResults(job: BatchJobHandle): Promise<void> {
        ok(job.data.step === BatchJobStep.UploadResults, 'Invalid step.')

        const { bucket, key, organizationId, credentialId } = job.data

        const { resultFilePath } = await this.resultWriter.write(bucket, key, organizationId, job.id)

        await job.updateStep({
            step: BatchJobStep.Finish,
            resultFilePath,
            organizationId,
            credentialId,
        })
    }

    private async validateFile(job: BatchJobHandle): Promise<void> {
        ok(job.data.step === BatchJobStep.Validate, 'Invalid step.')

        const { bucket, key, organizationId, credentialId } = job.data
        const batchId = job.id

        let rowCount = 0
        const seenAddresses = new Set<string>()
        let rowBuffer: { batchId: string; sourceRow: number; originalEmail: string; normalizedAddress: string }[] = []
        let addressBuffer: { normalizedAddress: string; firstSeenRow: number }[] = []

        for await (const row of this.input.rows(bucket, key)) {
            rowCount++
            const normalizedAddress = row.email.toLowerCase()
            rowBuffer.push({ batchId, sourceRow: rowCount, originalEmail: row.email, normalizedAddress })
            if (!seenAddresses.has(normalizedAddress)) {
                seenAddresses.add(normalizedAddress)
                addressBuffer.push({ normalizedAddress, firstSeenRow: rowCount })
            }
            if (rowBuffer.length >= ROW_PAGE_SIZE) {
                await this.rows.insertMany(organizationId, rowBuffer)
                rowBuffer = []
            }
            if (addressBuffer.length >= ROW_PAGE_SIZE) {
                await this.admissions.insertUniqueAddresses(batchId, organizationId, addressBuffer)
                addressBuffer = []
            }
        }
        if (rowBuffer.length > 0) await this.rows.insertMany(organizationId, rowBuffer)
        if (addressBuffer.length > 0) await this.admissions.insertUniqueAddresses(batchId, organizationId, addressBuffer)

        // TODO(verification-billing/05): thread the upload's own Idempotency-Key/content digest through
        // `BatchJobData` once the controller-level replay wiring lands, instead of always `null` here.
        await this.admissions.createOrReplay({
            batchId,
            organizationId,
            totalRows: rowCount,
            uniqueAddressCount: seenAddresses.size,
            clientRequestKey: null,
            contentDigest: null,
        })

        await job.updateStep({
            step: BatchJobStep.Admit,
            bucket,
            key,
            organizationId,
            credentialId,
        })
    }

    private async admitBatch(job: BatchJobHandle): Promise<void> {
        ok(job.data.step === BatchJobStep.Admit, 'Invalid step.')

        const { bucket, key, organizationId, credentialId } = job.data
        await this.admissionService.admit(job.id, organizationId)

        await job.updateStep({
            step: BatchJobStep.Dispatch,
            bucket,
            key,
            organizationId,
            credentialId,
        })
    }

    private async dispatchExecutions(job: BatchJobHandle): Promise<void> {
        ok(job.data.step === BatchJobStep.Dispatch, 'Invalid step.')

        const { bucket, key, organizationId, credentialId } = job.data
        const batchId = job.id

        for (let skip = 0; ; skip += DISPATCH_PAGE_SIZE) {
            const page = await this.admissions.pageUniqueAddresses(batchId, organizationId, skip, DISPATCH_PAGE_SIZE)
            if (page.length === 0) break
            for (const address of page) {
                if (address.admissionKind === 'created' && address.executionId !== null) {
                    await this.dispatcher.dispatch(address.executionId, organizationId)
                }
            }
        }

        await job.updateStep({
            step: BatchJobStep.AwaitSettlement,
            bucket,
            key,
            organizationId,
            credentialId,
        })
    }

    /**
     * Polls durable request state rather than a queue child count — cached/shared/cooldown addresses need no
     * child job of this batch's own at all. `token` is accepted (unused here) so the infrastructure worker can
     * pass it straight through to `job.moveToDelayed()` when it catches the raised signal, mirroring
     * `VerificationExecutionProcessor`'s own retry-scheduling idiom.
     */
    private async awaitSettlement(job: BatchJobHandle, _token: string): Promise<void> {
        ok(job.data.step === BatchJobStep.AwaitSettlement, 'Invalid step.')

        const { bucket, key, organizationId, credentialId } = job.data
        const unsettled = await this.admissions.countUnsettledAddresses(job.id, organizationId)
        if (unsettled > 0) {
            throw new BatchAwaitingSettlementSignal(Date.now() + this.pollIntervalMs)
        }

        await job.updateStep({
            step: BatchJobStep.UploadResults,
            bucket,
            key,
            organizationId,
            credentialId,
        })
    }
}
