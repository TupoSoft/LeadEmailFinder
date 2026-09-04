import { Injectable, Logger } from '@nestjs/common'
import { EmailVerificationReason, VerificationTraceContext } from '@tuposoft/lead-email-finder/common'
import {
    VerificationFailureStage,
    VerificationTraceObserver,
} from '../../application/verification-trace/verification-trace-observer'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const ERROR_TYPE = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/u
const MODES = new Set(['sync', 'deprecated_sync', 'async', 'batch', 'batch_child'])
const REASONS = new Set<string>(Object.values(EmailVerificationReason))
const STAGES = new Set<VerificationFailureStage>([
    'domain_policy',
    'email_cache_prepare',
    'verification_probe',
    'verification_persist',
    'email_cache_finalize',
    'queue_dispatch',
    'batch_validation',
    'batch_result_publication',
])

function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID.test(value)
}

function boundedNumber(value: number): number {
    return Number.isFinite(value) ? Math.min(2_147_483_647, Math.max(0, Math.floor(value))) : 0
}

function contextFields(context: VerificationTraceContext): Record<string, string | number> | undefined {
    if (!isUuid(context.operationId) || !MODES.has(context.mode)) return undefined

    const fields: Record<string, string | number> = { operationId: context.operationId, mode: context.mode }
    if (isUuid(context.jobId)) fields.jobId = context.jobId
    if (isUuid(context.batchId)) fields.batchId = context.batchId
    if (context.attempt !== undefined) fields.attempt = boundedNumber(context.attempt)
    return fields
}

@Injectable()
export class LoggingVerificationTraceObserver implements VerificationTraceObserver {
    private readonly logger = new Logger(LoggingVerificationTraceObserver.name)

    enqueued(event: Parameters<VerificationTraceObserver['enqueued']>[0]): void {
        if (!isUuid(event.requestId) || !isUuid(event.jobId) || !['async', 'batch'].includes(event.mode)) return
        this.logger.log({
            event: 'verification_enqueued',
            requestId: event.requestId,
            mode: event.mode,
            jobId: event.jobId,
        })
    }

    completed(event: Parameters<VerificationTraceObserver['completed']>[0]): void {
        const context = contextFields(event)
        if (!context || !isUuid(event.verificationId) || !REASONS.has(event.reason)) return
        this.logger.log({
            event: 'verification_completed',
            ...context,
            verificationId: event.verificationId,
            reason: event.reason,
            durationMs: boundedNumber(event.durationMs),
        })
    }

    batchCompleted(event: Parameters<VerificationTraceObserver['batchCompleted']>[0]): void {
        if (!isUuid(event.batchId)) return
        this.logger.log({
            event: 'verification_batch_completed',
            batchId: event.batchId,
            total: boundedNumber(event.total),
            processed: boundedNumber(event.processed),
            unprocessed: boundedNumber(event.unprocessed),
            durationMs: boundedNumber(event.durationMs),
        })
    }

    failed(event: Parameters<VerificationTraceObserver['failed']>[0]): void {
        const context = contextFields(event)
        if (!context || !STAGES.has(event.stage)) return
        this.logger.warn({
            event: 'verification_failed',
            ...context,
            stage: event.stage,
            errorType:
                typeof event.errorType === 'string' && ERROR_TYPE.test(event.errorType) ? event.errorType : 'Error',
            durationMs: boundedNumber(event.durationMs),
        })
    }
}
