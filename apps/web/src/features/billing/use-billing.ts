import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/use-auth'
import { billingQueryKeys, readBillingSummary } from './billing-api'

export function useBillingQueries(organizationId: string) {
    const { api } = useAuth()
    const summary = useQuery({
        queryKey: billingQueryKeys.summary(organizationId),
        queryFn: ({ signal }) => readBillingSummary(api, signal),
    })

    return { summary }
}
