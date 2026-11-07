import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ApiError, StaleAuthResponseError } from '../../api/api-error'
import { useAuth } from '../auth/use-auth'
import {
    addOrganizationCredits,
    creditBalanceKey,
    creditOrganizationKey,
    readCreditBalance,
    readCreditOrganization,
    setOrganizationCredits,
} from './platform-credits-api'
import {
    clearCreditAdjustment,
    creditAdjustmentRecoveryWindowMs,
    isCreditAdjustmentExpired,
    readCreditAdjustment,
    saveCreditAdjustment,
    type CreditAdjustmentRecord,
} from './credit-adjustment-recovery'
import { creditsCopy as copy } from './platform-credits-copy'

export function usePlatformCredits(membershipId: string, organizationId: string) {
    const { api } = useAuth()
    const queryClient = useQueryClient()

    // Restore same-tab recovery only for the current membership and target organization.
    const [adjustment, setAdjustment] = useState(() => readCreditAdjustment(membershipId, organizationId))
    const [restored, setRestored] = useState(() => adjustment !== null)
    const [, refreshExpiry] = useState(0)

    // Refresh retry eligibility when the local recovery window ends, keeping the unresolved record.
    useEffect(() => {
        if (!adjustment || isCreditAdjustmentExpired(adjustment)) return

        const timeout = window.setTimeout(
            () => refreshExpiry(value => value + 1),
            Math.max(0, adjustment.createdAt + creditAdjustmentRecoveryWindowMs - Date.now()),
        )

        return () => window.clearTimeout(timeout)
    }, [adjustment])

    const [pending, setPending] = useState<'add' | 'set' | null>(null)
    const [notice, setNotice] = useState('')
    const [unknownSet, setUnknownSet] = useState<number | null>(null)
    const [formVersion, setFormVersion] = useState(0)

    const lifetime = useRef({ generation: 0, controller: new AbortController(), pending: false })

    const organization = useQuery({
        queryKey: creditOrganizationKey(membershipId, organizationId),
        queryFn: ({ signal }) => readCreditOrganization(api, organizationId, signal),
    })

    // A zero balance does not establish organization existence; load its authoritative details first.
    const balance = useQuery({
        queryKey: creditBalanceKey(membershipId, organizationId),
        queryFn: ({ signal }) => readCreditBalance(api, organizationId, signal),
        enabled: organization.isSuccess && !organization.isFetching,
    })

    const ready = organization.isSuccess && !organization.isFetching && balance.isSuccess && !balance.isFetching

    // Departure invalidates pending callbacks but retains recovery: aborting does not undo server work.
    useLayoutEffect(() => {
        const stop = () => {
            lifetime.current.generation += 1
            lifetime.current.controller.abort()
            lifetime.current.controller = new AbortController()
            lifetime.current.pending = false
        }

        window.addEventListener('pagehide', stop)

        return () => {
            window.removeEventListener('pagehide', stop)
            stop()
        }
    }, [])

    async function execute(kind: 'add' | 'set', amount: number, retained?: CreditAdjustmentRecord) {
        if (lifetime.current.pending || !navigator.onLine || !ready) return
        if (!Number.isInteger(amount) || amount < (kind === 'add' ? 1 : 0) || amount > 2147483647) return
        // An unresolved addition blocks new adjustments until it is recovered or explicitly abandoned.
        if (kind === 'add' && (retained ? isCreditAdjustmentExpired(retained) : adjustment !== null)) return
        if (kind === 'set' && adjustment) return

        let operation = retained

        if (kind === 'add') {
            // Explicit retries preserve the original key, amount, and recovery deadline.
            operation = {
                ...retained,
                version: 1,
                membershipId,
                organizationId,
                amount,
                key: retained?.key ?? crypto.randomUUID(),
                state: 'pending',
                createdAt: retained?.createdAt ?? Date.now(),
            }

            // Verify persistence before POST so a lost response can be recovered with the same key.
            if (!saveCreditAdjustment(operation)) {
                setNotice(copy.storageFailed)
                return
            }

            setAdjustment(operation)
        }

        const { generation, controller } = lifetime.current
        // Ignore late responses after this page lifetime has ended, even if the server completed the request.
        const current = () => generation === lifetime.current.generation && !controller.signal.aborted

        // Set the ref before the first await; React state alone cannot block immediate repeated activation.
        lifetime.current.pending = true
        setPending(kind)
        setRestored(false)
        setNotice('')
        setUnknownSet(null)

        // Cancel old balance reads before dispatch so an earlier response cannot overwrite this result.
        await queryClient.cancelQueries({ queryKey: creditBalanceKey(membershipId, organizationId), exact: true })
        if (!current()) return

        try {
            const result =
                kind === 'add'
                    ? await addOrganizationCredits(api, organizationId, amount, operation!.key, controller.signal)
                    : await setOrganizationCredits(api, organizationId, amount, controller.signal)
            if (!current()) return

            queryClient.setQueryData(creditBalanceKey(membershipId, organizationId), result)

            const cleared = !operation || clearCreditAdjustment(membershipId)
            if (cleared) setAdjustment(null)

            setNotice(!cleared ? copy.storageClearFailed : kind === 'add' ? copy.added : copy.setSuccess)
            setFormVersion(value => value + 1)
        } catch (error) {
            if (!current()) return

            // Session cleanup must not be followed by recreating recovery from a stale request.
            if (
                error instanceof StaleAuthResponseError ||
                (error instanceof ApiError &&
                    (error.category === 'session-expired' || error.category === 'account-unavailable'))
            ) {
                lifetime.current.controller.abort()
                return
            }

            const status = error instanceof ApiError ? error.status : undefined

            if (status === 400 || status === 403) {
                if (retained) {
                    // Rejecting this retry does not resolve whether the earlier attempt applied.
                    saveCreditAdjustment(retained)
                    setAdjustment(retained)
                    setNotice(copy.retryRejected)
                } else {
                    const cleared = !operation || clearCreditAdjustment(membershipId)
                    if (cleared) setAdjustment(null)

                    setNotice(!cleared ? copy.storageClearFailed : status === 400 ? copy.invalid : copy.denied)
                }
            } else if (operation) {
                // Keep conflicting or uncertain additions recorded until the operator resolves or abandons them.
                const unresolved = {
                    ...operation,
                    state: status === 409 ? ('conflict' as const) : ('unknown' as const),
                }

                saveCreditAdjustment(unresolved)
                setAdjustment(unresolved)
                setNotice(status === 409 ? copy.conflict : copy.unknown)
            } else {
                // Absolute sets have no recovery key; reload the balance before another explicit set.
                setUnknownSet(amount)
                setNotice(copy.setUnknown)
            }
        } finally {
            if (current()) {
                // Re-enable mutations only after refreshing the authoritative balance in the same page lifetime.
                await balance.refetch()

                if (current()) {
                    lifetime.current.pending = false
                    setPending(null)
                }
            }
        }
    }

    return {
        organization,
        balance,
        adjustment,
        restored,
        pending,
        ready,
        // A matching current balance is an observation, not proof that the uncertain PUT applied.
        notice:
            unknownSet !== null && balance.isSuccess && !balance.isFetching && balance.data.balance === unknownSet
                ? copy.setMatches
                : notice,
        formVersion,
        expired: adjustment !== null && isCreditAdjustmentExpired(adjustment),
        add: (amount: number) => execute('add', amount),
        set: (amount: number) => execute('set', amount),
        retry: () => (adjustment ? execute('add', adjustment.amount, adjustment) : undefined),
        refresh: () => balance.refetch(),
        // Abandonment clears local recovery; it does not cancel or reverse an accepted grant.
        abandon: () => {
            if (!lifetime.current.pending && adjustment && clearCreditAdjustment(membershipId)) {
                setAdjustment(null)
                setNotice(copy.abandoned)
                setFormVersion(value => value + 1)
            }
        },
    }
}
