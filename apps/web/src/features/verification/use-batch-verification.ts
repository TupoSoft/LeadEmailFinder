import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/use-auth'
import { batchVerificationQueryKeys, readBatchVerification } from './batch-verification-api'
import { useVerificationPolling } from './use-verification-polling'

export function useBatchVerificationJob(organizationId: string, id: string) {
    const { api } = useAuth()
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
    return { query, ...polling }
}
