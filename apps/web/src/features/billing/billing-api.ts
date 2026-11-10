import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export type BillingSummary = paths['/v1/billing/summary']['get']['responses'][200]['content']['application/json']
function requireData<T>(result: { data?: T; response: Response }): T {
    if (result.data === undefined) throw new ApiError(result.response.status, 'request-failed')
    return result.data
}

export async function readBillingSummary(api: ApiClient, signal?: AbortSignal): Promise<BillingSummary> {
    const { balance, reserved, available } = requireData(await api.GET('/v1/billing/summary', { signal }))
    return { balance, reserved, available }
}

export const billingQueryKeys = {
    summary: (organizationId: string) => ['billing', organizationId, 'summary'] as const,
}
