import {
    VERIFICATION_EXECUTION_DEFAULT_JOB_OPTIONS,
    VERIFICATION_EXECUTION_JOB_NAME,
    VERIFICATION_EXECUTION_PAYLOAD_VERSION,
    VERIFICATION_EXECUTION_QUEUE_NAME,
    verificationExecutionBackoff,
} from './verification-execution-queue.config'

describe('verification execution queue protocol', () => {
    it('preserves the queue name, job name, payload version, and default retry options', () => {
        expect(VERIFICATION_EXECUTION_QUEUE_NAME).toBe('verification-execution')
        expect(VERIFICATION_EXECUTION_JOB_NAME).toBe('verification-execution')
        expect(VERIFICATION_EXECUTION_PAYLOAD_VERSION).toBe(1)
        expect(VERIFICATION_EXECUTION_DEFAULT_JOB_OPTIONS).toEqual({
            attempts: 10,
            backoff: { type: 'verification-execution' },
            removeOnComplete: true,
            removeOnFail: true,
        })
    })

    it('retries a permit-unavailable throw after a short fixed delay', () => {
        expect(verificationExecutionBackoff(1, 'verification-execution')).toBe(250)
        expect(verificationExecutionBackoff(9, 'verification-execution')).toBe(250)
    })

    it('rejects an unknown backoff type', () => {
        expect(() => verificationExecutionBackoff(1, 'unsupported')).toThrow('Unknown type: unsupported')
    })
})
