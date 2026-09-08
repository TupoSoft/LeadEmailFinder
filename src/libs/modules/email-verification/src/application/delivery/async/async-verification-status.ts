import {
    EmailPatternEnum,
    EmailVerificationReason,
    EmailVerificationSource,
    IEmailVerificationResponseDto,
} from '@tuposoft/lead-email-finder/common'
import { AsyncVerificationSnapshot } from './async-verification-jobs'

export type AsyncVerificationResult = Omit<IEmailVerificationResponseDto, 'createdAt'>

export type AsyncVerificationStatus =
    | { state: 'queued' }
    | { state: 'running' }
    | { state: 'completed'; result: AsyncVerificationResult }
    | { state: 'failed'; failureCode: 'verification_failed' }
    | { state: 'unavailable' }

const reasons = new Set<string>(Object.values(EmailVerificationReason))
const patterns = new Set<string>(Object.values(EmailPatternEnum))
const sources = new Set<string>([...Object.values(EmailVerificationSource), 'linkedin'])

function nonemptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0
}

function nullableBoolean(value: unknown): value is boolean | null {
    return value === null || typeof value === 'boolean'
}

/** Queue return values can outlive code changes; validate before exposing an allowlisted result. */
function sanitizeResult(value: unknown): AsyncVerificationResult | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    const result = value as Record<string, unknown>
    if (
        !nonemptyString(result.id) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id) ||
        !nonemptyString(result.email) ||
        !nonemptyString(result.localPart) ||
        !nonemptyString(result.domain) ||
        !nullableBoolean(result.exists) ||
        !nullableBoolean(result.catchAll) ||
        typeof result.reason !== 'string' ||
        !reasons.has(result.reason) ||
        !Array.isArray(result.sources) ||
        !result.sources.every(source => typeof source === 'string' && sources.has(source)) ||
        (result.format != null && (typeof result.format !== 'string' || !patterns.has(result.format))) ||
        (result.mxDomain != null && !nonemptyString(result.mxDomain)) ||
        (result.targetExchange != null && !nonemptyString(result.targetExchange))
    )
        return undefined

    return {
        id: result.id,
        email: result.email,
        localPart: result.localPart,
        domain: result.domain,
        exists: result.exists,
        catchAll: result.catchAll,
        reason: result.reason as EmailVerificationReason,
        sources: [...(result.sources as AsyncVerificationResult['sources'])],
        ...(result.format != null ? { format: result.format as EmailPatternEnum } : {}),
        ...(result.mxDomain != null ? { mxDomain: result.mxDomain } : {}),
        ...(result.targetExchange != null ? { targetExchange: result.targetExchange } : {}),
    }
}

export function mapAsyncVerificationStatus(snapshot: AsyncVerificationSnapshot): AsyncVerificationStatus {
    switch (snapshot.state) {
        case 'queued':
        case 'running':
            return { state: snapshot.state }
        case 'failed':
            return { state: 'failed', failureCode: 'verification_failed' }
        case 'completed': {
            const result = sanitizeResult(snapshot.result)
            return result ? { state: 'completed', result } : { state: 'unavailable' }
        }
        default:
            return { state: 'unavailable' }
    }
}
