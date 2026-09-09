import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export const creditRequestTimeoutMs = 30_000

async function withinRequestDeadline<T>(signal: AbortSignal, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const timeout = new AbortController()
    const timer = window.setTimeout(
        () => timeout.abort(new DOMException('Credit request timed out.', 'TimeoutError')),
        creditRequestTimeoutMs,
    )
    try {
        return await request(AbortSignal.any([signal, timeout.signal]))
    } finally {
        window.clearTimeout(timer)
    }
}

export type CreditBalance = paths['/credits/{organizationId}']['get']['responses'][200]['content']['application/json']
export const creditBalanceKey = (membershipId: string, organizationId: string) =>
    ['platform-credits', membershipId, organizationId, 'balance'] as const
export const creditOrganizationKey = (membershipId: string, organizationId: string) =>
    ['platform-credits', membershipId, organizationId, 'organization'] as const

function requireData<T>(result: { data?: T; response: Response }): T {
    if (result.data === undefined) throw new ApiError(result.response.status, 'request-failed')
    return result.data
}
function requireBalance(result: { data?: CreditBalance; response: Response }): CreditBalance {
    const { balance } = requireData(result)
    if (!Number.isSafeInteger(balance) || balance < 0) throw new ApiError(502, 'request-failed')
    return { balance }
}

export async function readCreditOrganization(api: ApiClient, organizationId: string, signal: AbortSignal) {
    const { id, name, createdAt, updatedAt } = requireData(
        await withinRequestDeadline(signal, requestSignal =>
            api.GET('/v1/organizations/{organizationId}', {
                params: { path: { organizationId } },
                signal: requestSignal,
            }),
        ),
    )
    if (id !== organizationId || typeof name !== 'string' || !name.trim()) throw new ApiError(502, 'request-failed')
    return { id, name, createdAt, updatedAt }
}
export async function readCreditBalance(api: ApiClient, organizationId: string, signal: AbortSignal) {
    return requireBalance(
        await withinRequestDeadline(signal, requestSignal =>
            api.GET('/credits/{organizationId}', { params: { path: { organizationId } }, signal: requestSignal }),
        ),
    )
}
export async function addOrganizationCredits(
    api: ApiClient,
    organizationId: string,
    amount: number,
    key: string,
    signal: AbortSignal,
) {
    return requireBalance(
        await withinRequestDeadline(signal, requestSignal =>
            api.POST('/credits/{organizationId}', {
                params: { path: { organizationId }, header: { 'Idempotency-Key': key } },
                body: { amount },
                signal: requestSignal,
            }),
        ),
    )
}
export async function setOrganizationCredits(
    api: ApiClient,
    organizationId: string,
    amount: number,
    signal: AbortSignal,
) {
    return requireBalance(
        await withinRequestDeadline(signal, requestSignal =>
            api.PUT('/credits/{organizationId}', {
                params: { path: { organizationId } },
                body: { amount },
                signal: requestSignal,
            }),
        ),
    )
}
