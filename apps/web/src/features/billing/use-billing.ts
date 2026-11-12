import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/use-auth'
import { billingQueryKeys, readBillingSummary } from './billing-api'

export function useBillingQueries(userId: string) {
    const { api } = useAuth()
    const summary = useQuery({
        queryKey: billingQueryKeys.summary(userId),
        queryFn: ({ signal }) => readBillingSummary(api, signal),
    })

    return { summary }
}
