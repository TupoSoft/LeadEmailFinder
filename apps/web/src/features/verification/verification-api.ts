import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export type VerificationStatus = paths['/verifyAsync/{id}']['get']['responses'][200]['content']['application/json']
export type VerificationResult = Extract<VerificationStatus, { state: 'completed' }>['result']

export const verificationQueryKeys = {
    job: (organizationId: string, id: string) => ['verification', organizationId, 'job', id] as const,
    submission: (organizationId: string) => ['verification', organizationId, 'submission'] as const,
}

export function isVerificationId(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export async function createVerification(api: ApiClient, email: string): Promise<{ id: string }> {
    const { data, response } = await api.POST('/verifyAsync', {
        body: { email },
        signal: AbortSignal.timeout(30_000),
    })
    if (response.status !== 202 || !data || !isVerificationId(data.id))
        throw new ApiError(response.status, 'request-failed')
    return { id: data.id }
}

export async function readVerification(api: ApiClient, id: string, signal?: AbortSignal): Promise<VerificationStatus> {
    const timeout = AbortSignal.timeout(15_000)
    const { data, response } = await api.GET('/verifyAsync/{id}', {
        params: { path: { id } },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!data) throw new ApiError(response.status, 'request-failed')
    // Only the public contract enters the session cache, even if a server adds fields accidentally.
    switch (data.state) {
        case 'queued':
        case 'running':
        case 'unavailable':
            return { state: data.state }
        case 'failed':
            return { state: 'failed', failureCode: 'verification_failed' }
        case 'completed': {
            const result = data.result
            const nullableBoolean = (value: unknown) => value === null || typeof value === 'boolean'
            if (
                !result ||
                typeof result.id !== 'string' ||
                !isVerificationId(result.id) ||
                ![result.email, result.localPart, result.domain, result.reason].every(
                    value => typeof value === 'string' && value.length > 0,
                ) ||
                !nullableBoolean(result.exists) ||
                !nullableBoolean(result.catchAll) ||
                !Array.isArray(result.sources) ||
                !result.sources.every(value => typeof value === 'string') ||
                ![result.format, result.mxDomain, result.targetExchange].every(
                    value => value === undefined || typeof value === 'string',
                )
            )
                throw new ApiError(502, 'request-failed')
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
