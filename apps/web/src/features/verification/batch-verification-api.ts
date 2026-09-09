import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError, normalizeApiError, StaleAuthResponseError } from '../../api/api-error'
import { isVerificationId } from './verification-api'

export type BatchVerificationStatus = paths['/verifyBatch/{id}']['get']['responses'][200]['content']['application/json']

export const batchVerificationQueryKeys = {
    job: (organizationId: string, id: string) => ['verification', organizationId, 'batch', id] as const,
}

function requestSignal(signal: AbortSignal | undefined, milliseconds: number): AbortSignal {
    const timeout = AbortSignal.timeout(milliseconds)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
}

function transportFailure(error: unknown): never {
    if (error instanceof ApiError || error instanceof StaleAuthResponseError) throw error
    // Fetch and body parsing errors may contain private URLs or response text.
    throw new ApiError(0, 'request-failed')
}

export async function createBatchVerification(
    api: ApiClient,
    file: File,
    signal?: AbortSignal,
): Promise<{ id: string }> {
    const { data, response } = await api
        .POST('/verifyBatch/csv', {
            body: { file },
            bodySerializer: body => {
                const form = new FormData()
                // Browser file MIME values vary; the server still validates the actual CSV.
                form.append('file', body.file.slice(0, body.file.size, 'text/csv'), file.name)
                return form
            },
            signal: requestSignal(signal, 120_000),
            cache: 'no-store',
        })
        .catch(transportFailure)
    if (!response.ok) throw await normalizeApiError(response, false)
    if (response.status !== 202 || !data || !isVerificationId(data.id))
        throw new ApiError(response.status, 'request-failed')
    return { id: data.id }
}

export async function readBatchVerification(
    api: ApiClient,
    id: string,
    signal?: AbortSignal,
): Promise<BatchVerificationStatus> {
    const { data, response } = await api
        .GET('/verifyBatch/{id}', {
            params: { path: { id } },
            signal: requestSignal(signal, 15_000),
            cache: 'no-store',
        })
        .catch(transportFailure)
    if (!response.ok) throw await normalizeApiError(response, false)
    if (
        !data ||
        data.id !== id ||
        !Number.isFinite(data.progress) ||
        data.progress < 0 ||
        data.progress > 100 ||
        ![data.total, data.processed, data.unprocessed].every(value => Number.isSafeInteger(value) && value >= 0)
    )
        throw new ApiError(502, 'request-failed')
    const status: BatchVerificationStatus['status'] = ['queued', 'running', 'completed', 'failed'].includes(data.status)
        ? data.status
        : 'unavailable'
    // Project safe public fields before the response enters the authenticated query cache.
    const snapshot: BatchVerificationStatus = {
        id,
        status,
        progress: data.progress,
        total: data.total,
        processed: data.processed,
        unprocessed: data.unprocessed,
    }
    if (status === 'failed') {
        snapshot.failureCode =
            data.failureCode === 'invalid_csv' || data.failureCode === 'insufficient_credits'
                ? data.failureCode
                : 'processing_failed'
    }
    return snapshot
}

function resultFilename(disposition: string | null): string {
    const fallback = 'verification-results.csv'
    if (!disposition || !/^attachment(?:;|$)/i.test(disposition)) return fallback
    const extended = /(?:^|;)\s*filename\*=UTF-8''([^;]+)/i.exec(disposition)
    const regular = /(?:^|;)\s*filename=(?:"([^"\\]*)"|([^;\s]+))/i.exec(disposition)
    let filename: string | undefined
    try {
        filename = extended ? decodeURIComponent(extended[1]) : (regular?.[1] ?? regular?.[2])
    } catch {
        return fallback
    }
    return filename &&
        /^[a-z0-9][a-z0-9 _.-]{0,119}\.csv$/i.test(filename) &&
        !filename.includes('..') &&
        !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(filename)
        ? filename
        : fallback
}

export async function downloadBatchVerification(
    api: ApiClient,
    id: string,
    signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
    const { data, response } = await api
        .GET('/verifyBatch/{id}/results', {
            params: { path: { id } },
            parseAs: 'blob',
            signal: requestSignal(signal, 120_000),
            cache: 'no-store',
        })
        .catch(transportFailure)
    if (!response.ok) throw await normalizeApiError(response, false)
    if (!data || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/csv')
        throw new ApiError(502, 'request-failed')
    return { blob: data, filename: resultFilename(response.headers.get('content-disposition')) }
}
