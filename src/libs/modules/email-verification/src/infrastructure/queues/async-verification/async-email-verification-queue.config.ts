import { parseTimeString } from '@tuposoft/lead-email-finder/common'
import { GreylistedException } from './greylisted.exception'

export const ASYNC_EMAIL_VERIFICATION_QUEUE_NAME = 'async-email-verification'
export const ASYNC_EMAIL_VERIFICATION_JOB_NAME = 'async-email-verification'
export const EMAIL_VERIFICATION_SERVICE_TOKEN = 'EmailVerificationServiceToken'

export const ASYNC_EMAIL_VERIFICATION_DEFAULT_JOB_OPTIONS = {
    attempts: 5,
    backoff: {
        type: 'async-email-verification',
    },
}

export function asyncEmailVerificationBackoff(attemptsMade: number, type?: string, error?: Error): number {
    if (type === 'async-email-verification') {
        if (error instanceof GreylistedException) {
            return attemptsMade * parseTimeString('1m')
        }

        return parseTimeString('10s')
    }

    throw new Error(`Unknown type: ${type}`)
}
