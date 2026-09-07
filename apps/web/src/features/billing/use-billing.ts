import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api/api-error'
import { billingCopy } from '../../content/billing'
import { useAuth } from '../auth/use-auth'
import {
    billingQueryKeys,
    createCheckout,
    readBillingSummary,
    readCreditPacks,
    readCreditPurchases,
    type Checkout,
} from './billing-api'
import { CheckoutUnavailableError, navigateToCheckout, safeCheckoutUrl } from './checkout-navigation'

export function useBillingQueries(organizationId: string) {
    const { api } = useAuth()
    const summary = useQuery({
        queryKey: billingQueryKeys.summary(organizationId),
        queryFn: ({ signal }) => readBillingSummary(api, signal),
    })
    const packs = useQuery({
        queryKey: billingQueryKeys.packs(organizationId),
        queryFn: ({ signal }) => readCreditPacks(api, signal),
    })
    const purchases = useQuery({
        queryKey: billingQueryKeys.purchases(organizationId),
        queryFn: ({ signal }) => readCreditPurchases(api, signal),
    })
    const { refetch: refetchSummary } = summary
    const { refetch: refetchPurchases } = purchases
    const refresh = useCallback(async () => {
        const [balance, history] = await Promise.all([refetchSummary(), refetchPurchases()])
        return { balance: balance.isSuccess && !balance.isFetching, history: history.isSuccess && !history.isFetching }
    }, [refetchSummary, refetchPurchases])
    return { organizationId, summary, packs, purchases, refresh }
}

function subscribeAvailability(listener: () => void) {
    window.addEventListener('online', listener)
    window.addEventListener('offline', listener)
    document.addEventListener('visibilitychange', listener)
    return () => {
        window.removeEventListener('online', listener)
        window.removeEventListener('offline', listener)
        document.removeEventListener('visibilitychange', listener)
    }
}

export function useBrowserAvailability() {
    const available = useSyncExternalStore(
        subscribeAvailability,
        () => navigator.onLine && document.visibilityState !== 'hidden',
        () => true,
    )
    const online = useSyncExternalStore(
        subscribeAvailability,
        () => navigator.onLine,
        () => true,
    )
    return { available, online }
}

export const returnPolling = { interval: 5000, maxChecks: 12 } as const

export function useReturnPolling(pending: boolean, refresh: () => Promise<unknown>, available: boolean) {
    const [checks, setChecks] = useState(0)
    useEffect(() => {
        if (!pending || !available || checks >= returnPolling.maxChecks) return
        let cancelled = false
        const timer = window.setTimeout(() => {
            // Recheck at dispatch time too: background throttling may delay the event/render.
            if (!navigator.onLine || document.visibilityState === 'hidden') return
            void refresh().finally(() => {
                if (!cancelled) setChecks(value => value + 1)
            })
        }, returnPolling.interval)
        return () => {
            cancelled = true
            window.clearTimeout(timer)
        }
    }, [pending, available, checks, refresh])
    return checks >= returnPolling.maxChecks
}

interface CheckoutState {
    phase: 'idle' | 'pending' | 'ready' | 'navigating' | 'review'
    selectedPack?: string
    notice?: string
    checkout?: Checkout
}

export function useCheckout(queries: ReturnType<typeof useBillingQueries>) {
    const { api, mutationOptions, queryClient } = useAuth()
    const mounted = useRef(true)
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])
    const queryKey = billingQueryKeys.checkout(queries.organizationId)
    const { data: checkoutState } = useQuery<CheckoutState>({
        queryKey,
        initialData: { phase: 'idle' },
        enabled: false,
        gcTime: Infinity,
    })
    // The session owns this record, so leaving the route cannot discard a non-idempotent request lock.
    const coordinator = queryClient.getQueryCache().find({ queryKey, exact: true })
    function readState(): CheckoutState | undefined {
        return queryClient.getQueryCache().find({ queryKey, exact: true }) === coordinator
            ? queryClient.getQueryData<CheckoutState>(queryKey)
            : undefined
    }
    function writeState(value: CheckoutState) {
        // An auth boundary removes the coordinator; late refresh continuations must not recreate it.
        if (readState()) queryClient.setQueryData(queryKey, value)
    }
    const { refresh } = queries
    const { refetch: refetchPacks } = queries.packs

    async function refreshAfterFailure() {
        const recovery = readState()
        if (recovery?.phase !== 'review') return
        const result = await refresh()
        // A superseded recovery must never unlock or overwrite a newer purchase request.
        if (readState() === recovery) writeState({ phase: result.history ? 'idle' : 'review', notice: recovery.notice })
    }

    function continueCheckout(result: Checkout) {
        if (!mounted.current || !navigator.onLine || !readState()) return
        writeState({ ...readState(), phase: 'navigating' })
        try {
            navigateToCheckout(result.id, result.redirectUrl)
        } catch {
            writeState({ phase: 'review', notice: billingCopy.checkoutUnavailable })
            void refreshAfterFailure()
        }
    }

    const mutation = useMutation(
        mutationOptions({
            mutationFn: async (packId: string) => {
                const result = await createCheckout(api, packId)
                return { ...result, redirectUrl: safeCheckoutUrl(result.redirectUrl) }
            },
            onSuccess: result => {
                writeState({
                    phase: 'ready',
                    selectedPack: readState()?.selectedPack,
                    notice: billingCopy.checkoutReady,
                    checkout: result,
                })
                if (mounted.current) continueCheckout(result)
            },
            onError: async error => {
                if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                    writeState({ phase: 'idle' })
                    return
                }
                if (error instanceof ApiError && error.status === 400) {
                    writeState({
                        phase: 'pending',
                        selectedPack: readState()?.selectedPack,
                        notice: billingCopy.packUnavailable,
                    })
                    await refetchPacks()
                    writeState({ phase: 'idle', notice: billingCopy.packUnavailable })
                } else {
                    const notice =
                        error instanceof CheckoutUnavailableError || (error instanceof ApiError && error.status === 502)
                            ? billingCopy.checkoutUnavailable
                            : billingCopy.uncertain
                    writeState({ phase: 'review', notice })
                    await refreshAfterFailure()
                }
            },
        }),
    )

    function start(packId: string) {
        if (readState()?.phase !== 'idle' || !navigator.onLine) return
        writeState({ phase: 'pending', selectedPack: packId, notice: billingCopy.checkoutPending })
        mutation.mutate(packId)
    }

    return {
        start,
        selectedPack: checkoutState.selectedPack,
        notice: checkoutState.notice,
        needsHistory: checkoutState.phase === 'review',
        recovering: queries.summary.isFetching || queries.purchases.isFetching,
        ready: checkoutState.phase === 'ready',
        continueCheckout: () => {
            const state = readState()
            if (state?.phase === 'ready' && state.checkout) continueCheckout(state.checkout)
        },
        refreshAfterFailure,
    }
}
