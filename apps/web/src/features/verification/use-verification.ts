import { useEffect, useRef } from 'react'
import { skipToken, useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api/api-error'
import { createVerificationRequestKey } from '../../shared/verification-request-key'
import { useAuth } from '../auth/use-auth'
import { billingQueryKeys, readBillingSummary } from '../billing/billing-api'
import { useVerificationPolling } from './use-verification-polling'
import { createVerification, readVerification, verificationQueryKeys } from './verification-api'

export { verificationPolling } from './use-verification-polling'

type SubmissionRequest = { email: string; requestKey: string }
type SubmissionState =
    | { phase: 'idle' | 'invalid' | 'insufficient' | 'clock-rejected' }
    | { phase: 'pending' | 'uncertain' | 'expired'; request: SubmissionRequest }
    | { phase: 'rate-limited'; request: SubmissionRequest; retryAt?: number }
    | { phase: 'ready'; id: string }

export function useVerificationSubmission(userId: string, onCreated: (id: string) => void) {
    const { api, queryClient, mutationOptions, state } = useAuth()
    const mounted = useRef(false)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])
    const queryKey = verificationQueryKeys.submission(userId)
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
    function refreshBilling() {
        if (!read() || state.status !== 'authenticated') return
        void queryClient
            .fetchQuery({
                queryKey: billingQueryKeys.summary(userId),
                queryFn: ({ signal }) => readBillingSummary(api, signal),
                staleTime: 0,
                retry: false,
            })
            .catch(() => undefined)
    }
    const mutation = useMutation(
        mutationOptions({
            mutationFn: ({ email, requestKey }: SubmissionRequest) => createVerification(api, email, requestKey),
            networkMode: 'always',
            gcTime: 0,
            retry: false,
            onSuccess: ({ id }) => {
                if (!read()) return
                write({ phase: 'ready', id })
                if (mounted.current) {
                    onCreated(id)
                    write({ phase: 'idle' })
                }
            },
            onError: (error, request) => {
                if (error instanceof ApiError) {
                    if ([400, 402, 429].includes(error.status)) refreshBilling()
                    switch (error.status) {
                        case 400:
                            return write({
                                phase: error.code === 'idempotency_key_too_far_ahead' ? 'clock-rejected' : 'invalid',
                            })
                        case 402:
                            return write({ phase: 'insufficient' })
                        case 401:
                        case 403:
                            return write({ phase: 'idle' })
                        case 429:
                            return write({ phase: 'rate-limited', request, retryAt: error.retryAt })
                        case 410:
                            return write({ phase: 'expired', request })
                    }
                }
                write({ phase: 'uncertain', request })
            },
        }),
    )
    function send(request: SubmissionRequest) {
        write({ phase: 'pending', request })
        mutation.mutate(request)
    }
    return {
        submission: submission ?? { phase: 'idle' as const },
        start: (email: string) => {
            const current = read()
            if (
                !current ||
                !['idle', 'invalid', 'insufficient', 'clock-rejected'].includes(current.phase) ||
                !navigator.onLine
            )
                return
            send({ email, requestKey: createVerificationRequestKey() })
        },
        recover: () => {
            const current = read()
            if (!current || !navigator.onLine || (current.phase !== 'uncertain' && current.phase !== 'rate-limited'))
                return
            if (current.phase === 'rate-limited' && current.retryAt !== undefined && current.retryAt > Date.now())
                return
            send(current.request)
        },
        resetReady: () => {
            if (read()?.phase === 'ready' || read()?.phase === 'expired') write({ phase: 'idle' })
        },
    }
}

export function useVerificationJob(userId: string, id: string) {
    const { api, queryClient, state } = useAuth()
    const query = useQuery({
        queryKey: verificationQueryKeys.job(userId, id),
        queryFn: ({ signal }) => readVerification(api, id, signal),
        enabled: false,
        retry: false,
        networkMode: 'always',
    })
    const status = query.data?.state
    const operation = query.data && 'operation' in query.data ? query.data.operation : undefined
    const billingState = operation?.billing.state
    const canReadBilling = state.status === 'authenticated'
    useEffect(() => {
        if (!canReadBilling || (status !== 'completed' && status !== 'failed')) return
        void queryClient
            .fetchQuery({
                queryKey: billingQueryKeys.summary(userId),
                queryFn: ({ signal }) => readBillingSummary(api, signal),
                staleTime: 0,
                retry: false,
            })
            .catch(() => undefined)
    }, [api, billingState, canReadBilling, id, userId, queryClient, status])
    const polling = useVerificationPolling({
        active: status === 'queued' || status === 'running',
        isFetching: query.isFetching,
        isError: query.isError,
        refetch: query.refetch,
    })
    return { query, ...polling }
}
