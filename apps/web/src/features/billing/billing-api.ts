import type { ApiClient, paths } from '@tuposoft/lead-email-finder-api-client'
import { ApiError } from '../../api/api-error'

export type BillingSummary = paths['/v1/billing/summary']['get']['responses'][200]['content']['application/json']
export type CreditPack =
    paths['/v1/billing/credit-packs']['get']['responses'][200]['content']['application/json'][number]
export type CreditPurchase =
    paths['/v1/credit-purchases']['get']['responses'][200]['content']['application/json'][number]
export type Checkout = paths['/v1/credit-purchases']['post']['responses'][201]['content']['application/json']

function requireData<T>(result: { data?: T; response: Response }): T {
    if (result.data === undefined) throw new ApiError(result.response.status, 'request-failed')
    return result.data
}

export async function readBillingSummary(api: ApiClient, signal?: AbortSignal): Promise<BillingSummary> {
    const { balance, reserved, available } = requireData(await api.GET('/v1/billing/summary', { signal }))
    return { balance, reserved, available }
}

export async function readCreditPacks(api: ApiClient, signal?: AbortSignal): Promise<CreditPack[]> {
    return requireData(await api.GET('/v1/billing/credit-packs', { signal })).map(
        ({ id, credits, amountMinor, currency }) => ({ id, credits, amountMinor, currency }),
    )
}

export async function readCreditPurchases(api: ApiClient, signal?: AbortSignal): Promise<CreditPurchase[]> {
    // Project again before caching: accidental additional server fields have no browser owner.
    return requireData(await api.GET('/v1/credit-purchases', { signal })).map(
        ({ id, packId, credits, amountMinor, currency, status, createdAt, updatedAt }) => ({
            id,
            packId,
            credits,
            amountMinor,
            currency,
            status,
            createdAt,
            updatedAt,
        }),
    )
}

export async function createCheckout(api: ApiClient, packId: string): Promise<Checkout> {
    const { id, status, redirectUrl } = requireData(await api.POST('/v1/credit-purchases', { body: { packId } }))
    return { id, status, redirectUrl }
}

export const billingQueryKeys = {
    checkout: (organizationId: string) => ['billing', organizationId, 'checkout'] as const,
    summary: (organizationId: string) => ['billing', organizationId, 'summary'] as const,
    packs: (organizationId: string) => ['billing', organizationId, 'packs'] as const,
    purchases: (organizationId: string) => ['billing', organizationId, 'purchases'] as const,
}
