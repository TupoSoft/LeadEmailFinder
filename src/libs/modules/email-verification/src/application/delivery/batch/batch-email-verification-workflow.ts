import { CreditsService } from '@tuposoft/lead-email-finder/modules/credits'
import { safeErrorType } from '@tuposoft/lead-email-finder/common'
import { ok } from 'node:assert'
import { BatchJobStep } from '../../../domain/batch-job'
import {
    NOOP_VERIFICATION_TRACE_OBSERVER,
    observeSafely,
    VerificationFailureStage,
    VerificationTraceObserver,
} from '../../verification-trace/verification-trace-observer'
import { BatchJobHandle } from './batch-jobs'
import { BatchChildFlow } from './batch-child-flow'
import { BatchInput } from './batch-input'
import { BatchResultWriter } from './batch-result-writer'
import { BatchAwaitingChildrenSignal } from './batch-awaiting-children.signal'

export class BatchEmailVerificationWorkflow {
    constructor(
        private readonly input: BatchInput,
        private readonly childFlow: BatchChildFlow,
        private readonly resultWriter: BatchResultWriter,
        private readonly creditsService: CreditsService,
        private readonly traceObserver: VerificationTraceObserver = NOOP_VERIFICATION_TRACE_OBSERVER,
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
                    case BatchJobStep.Process:
                        stage = 'queue_dispatch'
                        await this.processFile(job)
                        break
                    case BatchJobStep.WaitForChildren:
                        stage = 'queue_dispatch'
                        await this.waitForChildren(job, token)
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
            if (!(error instanceof BatchAwaitingChildrenSignal)) {
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

        let rowCount = 0

        for await (const row of this.input.rows(bucket, key)) {
            void row
            rowCount++
        }

        await this.creditsService.debit(organizationId, rowCount, job.id)

        await job.updateStep({
            step: BatchJobStep.Process,
            bucket,
            key,
            organizationId,
            credentialId,
        })
    }

    private async processFile(job: BatchJobHandle): Promise<void> {
        ok(job.data.step === BatchJobStep.Process, 'Invalid step.')

        const { bucket, key, organizationId, credentialId } = job.data

        for await (const { email } of this.input.rows(bucket, key)) {
            await this.childFlow.dispatchChild(
                { id: job.id, queueQualifiedName: job.queueQualifiedName },
                { email, organizationId, credentialId },
            )
        }

        await job.updateStep({
            step: BatchJobStep.WaitForChildren,
            bucket,
            key,
            organizationId,
            credentialId,
        })
    }

    private async waitForChildren(job: BatchJobHandle, token: string): Promise<void> {
        ok(job.data.step === BatchJobStep.WaitForChildren, 'Invalid step.')

        const { shouldWait } = await this.childFlow.awaitChildren(job.id, token)

        if (shouldWait) {
            throw new BatchAwaitingChildrenSignal()
        }

        const { bucket, key, organizationId, credentialId } = job.data

        await job.updateStep({
            step: BatchJobStep.UploadResults,
            bucket,
            key,
            organizationId,
            credentialId,
        })
    }
}
