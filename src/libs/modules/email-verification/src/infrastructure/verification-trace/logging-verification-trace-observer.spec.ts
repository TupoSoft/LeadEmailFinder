import { Logger } from '@nestjs/common'
import { EmailVerificationReason } from '@tuposoft/lead-email-finder/common'
import { LoggingVerificationTraceObserver } from './logging-verification-trace-observer'
import { observeSafely } from '../../application/verification-trace/verification-trace-observer'

const id = '10000000-0000-4000-8000-000000000001'
const resultId = '20000000-0000-4000-8000-000000000001'
const privateText = 'trace-sentinel@private-domain.test'

describe('LoggingVerificationTraceObserver allowlist', () => {
    let log: jest.SpyInstance
    let warn: jest.SpyInstance
    const observer = new LoggingVerificationTraceObserver()

    beforeEach(() => {
        log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    })
    afterEach(() => jest.restoreAllMocks())

    it('copies only explicitly allowed fields and bounds numbers', () => {
        const extra = {
            email: privateText,
            message: privateText,
            stack: privateText,
            headers: { authorization: privateText },
        }
        observer.enqueued({ requestId: id, jobId: resultId, mode: 'async', ...extra })
        observer.completed({
            operationId: id,
            mode: 'batch_child',
            jobId: id,
            batchId: resultId,
            verificationId: resultId,
            reason: EmailVerificationReason.AcceptedEmail,
            durationMs: Infinity,
            attempt: -1,
            ...extra,
        })
        observer.batchCompleted({
            batchId: id,
            total: Number.MAX_VALUE,
            processed: 1.8,
            unprocessed: -1,
            durationMs: NaN,
            ...extra,
        })
        observer.failed({
            operationId: id,
            mode: 'async',
            jobId: privateText,
            batchId: privateText,
            stage: 'verification_probe',
            errorType: privateText,
            durationMs: -1,
            ...extra,
        })

        expect(log.mock.calls.map(([event]) => event as unknown)).toEqual([
            { event: 'verification_enqueued', requestId: id, jobId: resultId, mode: 'async' },
            {
                event: 'verification_completed',
                operationId: id,
                mode: 'batch_child',
                jobId: id,
                batchId: resultId,
                verificationId: resultId,
                reason: 'accepted_email',
                durationMs: 0,
                attempt: 0,
            },
            {
                event: 'verification_batch_completed',
                batchId: id,
                total: 2147483647,
                processed: 1,
                unprocessed: 0,
                durationMs: 0,
            },
        ])
        expect(warn).toHaveBeenCalledWith({
            event: 'verification_failed',
            operationId: id,
            mode: 'async',
            stage: 'verification_probe',
            errorType: 'Error',
            durationMs: 0,
        })
        expect(JSON.stringify([log.mock.calls, warn.mock.calls])).not.toContain(privateText)
    })

    it('drops events with invalid mandatory identifiers, mode, stage, or reason', () => {
        observer.enqueued({ requestId: privateText, jobId: id, mode: 'async' })
        observer.completed({
            operationId: id,
            mode: 'sync',
            verificationId: privateText,
            reason: EmailVerificationReason.AcceptedEmail,
            durationMs: 1,
        })
        observer.completed({
            operationId: id,
            mode: 'sync',
            verificationId: resultId,
            reason: privateText as EmailVerificationReason,
            durationMs: 1,
        })
        observer.failed({
            operationId: id,
            mode: 'sync',
            stage: privateText as never,
            errorType: 'Error',
            durationMs: 1,
        })
        observer.failed({
            operationId: id,
            mode: privateText as never,
            stage: 'verification_probe',
            errorType: 'Error',
            durationMs: 1,
        })
        observer.batchCompleted({ batchId: privateText, total: 1, processed: 1, unprocessed: 0, durationMs: 1 })
        expect(log).not.toHaveBeenCalled()
        expect(warn).not.toHaveBeenCalled()
    })

    it('contains a broken logger behind the observer boundary', () => {
        log.mockImplementation(() => {
            throw new Error(privateText)
        })
        expect(() =>
            observeSafely(() => observer.enqueued({ requestId: id, jobId: resultId, mode: 'async' })),
        ).not.toThrow()
    })
})
