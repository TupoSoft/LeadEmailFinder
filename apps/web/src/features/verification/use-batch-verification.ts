import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/use-auth'
import { billingQueryKeys, readBillingSummary } from '../billing/billing-api'
import { batchVerificationQueryKeys, readBatchVerification } from './batch-verification-api'
import { useVerificationPolling } from './use-verification-polling'

export function useBatchVerificationJob(organizationId: string, id: string) {
    const { api, queryClient, state } = useAuth()
    const canReadBilling = state.status === 'authenticated' && state.account.capabilities.includes('billing.read')
    const query = useQuery({
        queryKey: batchVerificationQueryKeys.job(organizationId, id),
        queryFn: ({ signal }) => readBatchVerification(api, id, signal),
        enabled: false,
        retry: false,
        networkMode: 'always',
    })
    const polling = useVerificationPolling({
        active: query.data?.status === 'queued' || query.data?.status === 'running',
        isFetching: query.isFetching,
        isError: query.isError,
        refetch: query.refetch,
    })
    const refreshed = useRef<string | null>(null)
    useEffect(() => {
        const data = query.data
        if (!canReadBilling || !data || (data.status !== 'completed' && data.status !== 'failed')) return
        const settledState = `${data.status}:${data.billing.state}:${data.billing.charged}:${data.billing.reserved}`
        if (refreshed.current === settledState) return
        refreshed.current = settledState
        // The authenticated transport and query abort signal prevent late account snapshots crossing sessions.
        void queryClient
            .fetchQuery({
                queryKey: billingQueryKeys.summary(organizationId),
                queryFn: ({ signal }) => readBillingSummary(api, signal),
                staleTime: 0,
                retry: false,
            })
            .catch(() => undefined)
    }, [api, canReadBilling, organizationId, query.data, queryClient])
    return { query, ...polling }
}
