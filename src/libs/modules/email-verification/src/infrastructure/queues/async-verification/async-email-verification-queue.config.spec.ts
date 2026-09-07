import { GreylistedException } from './greylisted.exception'
import {
    ASYNC_EMAIL_VERIFICATION_DEFAULT_JOB_OPTIONS,
    ASYNC_EMAIL_VERIFICATION_JOB_NAME,
    ASYNC_EMAIL_VERIFICATION_QUEUE_NAME,
    EMAIL_VERIFICATION_SERVICE_TOKEN,
    asyncEmailVerificationBackoff,
} from './async-email-verification-queue.config'

describe('async verification queue protocol', () => {
    it('preserves the existing queue, job, injection token, and default retry options', () => {
        expect(ASYNC_EMAIL_VERIFICATION_QUEUE_NAME).toBe('async-email-verification')
        expect(ASYNC_EMAIL_VERIFICATION_JOB_NAME).toBe('async-email-verification')
        expect(EMAIL_VERIFICATION_SERVICE_TOKEN).toBe('EmailVerificationServiceToken')
        expect(ASYNC_EMAIL_VERIFICATION_DEFAULT_JOB_OPTIONS).toEqual({
            attempts: 5,
            backoff: { type: 'async-email-verification' },
        })
    })

    it.each([1, 2, 3, 4])('waits %i minutes after that many greylist failures', attemptsMade => {
        expect(
            asyncEmailVerificationBackoff(
                attemptsMade,
                'async-email-verification',
                new GreylistedException('person@example.test'),
            ),
        ).toBe(attemptsMade * 60_000)
    })

    it.each([1, 2, 3, 4])('waits ten seconds after ordinary failure number %i', attemptsMade => {
        expect(asyncEmailVerificationBackoff(attemptsMade, 'async-email-verification', new Error('failure'))).toBe(
            10_000,
        )
    })

    it('rejects an unknown backoff type', () => {
        expect(() => asyncEmailVerificationBackoff(1, 'unsupported', new Error('failure'))).toThrow(
            'Unknown type: unsupported',
        )
    })
})
