import { VerificationSubmissionLimiterUnavailableError } from '../../application/ports/verification-submission-limiter'

/** Races a Redis call against a fixed deadline so a hung Redis connection fails fast and safe (503) rather than
 *  hanging the HTTP request or admitting unlimited free execution. Kept local to this module rather than reused
 *  from `bff-session`'s equivalent helper, which is a private internal file not exported from that module's
 *  public barrel. */
export const DEFAULT_VERIFICATION_REDIS_TIMEOUT_MS = 2000

export async function withVerificationRedisTimeout<T>(
    operation: string,
    promise: Promise<T>,
    timeoutMs: number = DEFAULT_VERIFICATION_REDIS_TIMEOUT_MS,
): Promise<T> {
    let timer: NodeJS.Timeout

    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new VerificationSubmissionLimiterUnavailableError(operation)), timeoutMs)
    })

    try {
        return await Promise.race([promise, timeout])
    } finally {
        clearTimeout(timer!)
    }
}
