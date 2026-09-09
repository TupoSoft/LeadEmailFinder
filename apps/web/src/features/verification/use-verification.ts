import { useEffect, useRef } from 'react'
import { skipToken, useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api/api-error'
import { useAuth } from '../auth/use-auth'
import { useVerificationPolling } from './use-verification-polling'
import { createVerification, readVerification, verificationQueryKeys } from './verification-api'

export { verificationPolling } from './use-verification-polling'

type SubmissionState =
    | { phase: 'idle' | 'pending' | 'invalid' | 'insufficient' | 'uncertain' }
    | { phase: 'ready'; id: string }

export function useVerificationSubmission(organizationId: string, onCreated: (id: string) => void) {
    const { api, queryClient, mutationOptions } = useAuth()
    const mounted = useRef(false)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])
    const queryKey = verificationQueryKeys.submission(organizationId)
    const { data: submission } = useQuery<SubmissionState>({
        queryKey,
        queryFn: skipToken,
        initialData: { phase: 'idle' },
        enabled: false,
        gcTime: Infinity,
    })
    const coordinator = queryClient.getQueryCache().find({ queryKey, exact: true })
    function read() {
        return queryClient.getQueryCache().find({ queryKey, exact: true }) === coordinator
            ? queryClient.getQueryData<SubmissionState>(queryKey)
            : undefined
    }
    function write(value: SubmissionState) {
        if (read()) queryClient.setQueryData(queryKey, value)
    }
    const mutation = useMutation(
        mutationOptions({
            mutationFn: (email: string) => createVerification(api, email),
            networkMode: 'always',
            gcTime: 0,
            onSuccess: ({ id }) => {
                write({ phase: 'ready', id })
                if (mounted.current) {
                    onCreated(id)
                    write({ phase: 'idle' })
                }
            },
            onError: error => {
                const phase =
                    error instanceof ApiError
                        ? error.status === 400
                            ? 'invalid'
                            : error.status === 402
                              ? 'insufficient'
                              : error.status === 401 || error.status === 403
                                ? 'idle'
                                : 'uncertain'
                        : 'uncertain'
                write({ phase })
            },
        }),
    )
    return {
        submission: submission ?? { phase: 'idle' as const },
        start: (email: string, acknowledged: boolean) => {
            const current = read()
            if (!current || current.phase === 'pending' || current.phase === 'ready' || !navigator.onLine) return
            if (current.phase === 'uncertain' && !acknowledged) return
            write({ phase: 'pending' })
            mutation.mutate(email)
        },
        resetReady: () => {
            if (read()?.phase === 'ready') write({ phase: 'idle' })
        },
    }
}

export function useVerificationJob(organizationId: string, id: string) {
    const { api } = useAuth()
    const query = useQuery({
        queryKey: verificationQueryKeys.job(organizationId, id),
        queryFn: ({ signal }) => readVerification(api, id, signal),
        enabled: false,
        retry: false,
        networkMode: 'always',
    })
    const polling = useVerificationPolling({
        active: query.data?.state === 'queued' || query.data?.state === 'running',
        isFetching: query.isFetching,
        isError: query.isError,
        refetch: query.refetch,
    })
    return { query, ...polling }
}
