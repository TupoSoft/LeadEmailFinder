import type { ApiClient, components, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export type VerificationStatus =
    paths['/v1/email-verifications/{id}']['get']['responses'][200]['content']['application/json']
export type VerificationResult = Extract<VerificationStatus, { state: 'completed' }>['result']
export type VerificationOperation = components['schemas']['VerificationOperationMetadataDto']

export const verificationQueryKeys = {
    job: (organizationId: string, id: string) => ['verification', organizationId, 'job', id] as const,
    submission: (organizationId: string) => ['verification', organizationId, 'submission'] as const,
}

export function isVerificationId(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export async function createVerification(api: ApiClient, email: string, requestKey: string): Promise<{ id: string }> {
    const { data, response } = await api.POST('/v1/email-verifications', {
        body: { email },
        headers: { 'Idempotency-Key': requestKey },
        signal: AbortSignal.timeout(30_000),
    })

    if (response.status !== 202 || !data || !isVerificationId(data.id)) {
        throw new ApiError(response.status, 'request-failed')
    }

    return { id: data.id }
}

function projectOperation(operation: VerificationOperation | undefined): VerificationOperation | undefined {
    if (!operation) {
        return undefined
    }

    const { id, source, observedAt, cacheExpiresAt, billing } = operation
    const isNullableTimestamp = (value: unknown): boolean =>
        value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)))

    if (
        typeof id !== 'string' ||
        !isVerificationId(id) ||
        !['fresh', 'cache', 'shared'].includes(source) ||
        !isNullableTimestamp(observedAt) ||
        !isNullableTimestamp(cacheExpiresAt) ||
        !billing ||
        !['pending', 'settled'].includes(billing.state) ||
        ![0, 1].includes(billing.charged) ||
        ![0, 1].includes(billing.reserved) ||
        (billing.reason !== undefined &&
            !['conclusive', 'cached', 'shared', 'inconclusive', 'failed'].includes(billing.reason))
    ) {
        return undefined
    }

    return {
        id,
        source,
        observedAt,
        cacheExpiresAt,
        billing: {
            state: billing.state,
            charged: billing.charged,
            reserved: billing.reserved,
            ...(billing.reason ? { reason: billing.reason } : {}),
        },
    }
}

export async function readVerification(api: ApiClient, id: string, signal?: AbortSignal): Promise<VerificationStatus> {
    const timeout = AbortSignal.timeout(15_000)
    const { data, response } = await api.GET('/v1/email-verifications/{id}', {
        params: { path: { id } },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })

    if (!data) {
        throw new ApiError(response.status, 'request-failed')
    }

    // Only the public contract enters the session cache, even if a server adds fields accidentally.
    switch (data.state) {
        case 'queued':
        case 'running':
        case 'unavailable':
            return { state: data.state }
        case 'failed':
            return {
                state: 'failed',
                failureCode: 'verification_failed',
                ...('operation' in data ? { operation: projectOperation(data.operation) } : {}),
            }
        case 'completed': {
            const result = data.result
            const isNullableBoolean = (value: unknown): boolean => value === null || typeof value === 'boolean'

            if (
                !result ||
                typeof result.id !== 'string' ||
                !isVerificationId(result.id) ||
                ![result.email, result.localPart, result.domain, result.reason].every(
                    value => typeof value === 'string' && value.length > 0,
                ) ||
                !isNullableBoolean(result.exists) ||
                !isNullableBoolean(result.catchAll) ||
                !Array.isArray(result.sources) ||
                !result.sources.every(value => typeof value === 'string') ||
                ![result.format, result.mxDomain, result.targetExchange].every(
                    value => value === undefined || typeof value === 'string',
                )
            ) {
                throw new ApiError(502, 'request-failed')
            }

            const {
                id: resultId,
                email,
                localPart,
                domain,
                format,
                exists,
                catchAll,
                reason,
                sources,
                mxDomain,
                targetExchange,
            } = data.result

            return {
                state: 'completed',
                ...('operation' in data ? { operation: projectOperation(data.operation) } : {}),
                result: {
                    id: resultId,
                    email,
                    localPart,
                    domain,
                    format,
                    exists,
                    catchAll,
                    reason,
                    sources,
                    mxDomain,
                    targetExchange,
                },
            }
        }
        default:
            return { state: 'unavailable' }
    }
}
