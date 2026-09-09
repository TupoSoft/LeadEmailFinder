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
    const [adjustment, setAdjustment] = useState(() => readCreditAdjustment(membershipId, organizationId))
    const [restored, setRestored] = useState(() => adjustment !== null)
    const [, refreshExpiry] = useState(0)
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
    const balance = useQuery({
        queryKey: creditBalanceKey(membershipId, organizationId),
        queryFn: ({ signal }) => readCreditBalance(api, organizationId, signal),
        enabled: organization.isSuccess && !organization.isFetching,
    })
    const ready = organization.isSuccess && !organization.isFetching && balance.isSuccess && !balance.isFetching
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
        if (kind === 'add' && (retained ? isCreditAdjustmentExpired(retained) : adjustment !== null)) return
        if (kind === 'set' && adjustment) return
        let operation = retained
        if (kind === 'add') {
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
            if (!saveCreditAdjustment(operation)) {
                setNotice(copy.storageFailed)
                return
            }
            setAdjustment(operation)
        }
        const { generation, controller } = lifetime.current
        const current = () => generation === lifetime.current.generation && !controller.signal.aborted
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
                    saveCreditAdjustment(retained)
                    setAdjustment(retained)
                    setNotice(copy.retryRejected)
                } else {
                    const cleared = !operation || clearCreditAdjustment(membershipId)
                    if (cleared) setAdjustment(null)
                    setNotice(!cleared ? copy.storageClearFailed : status === 400 ? copy.invalid : copy.denied)
                }
            } else if (operation) {
                const unresolved = {
                    ...operation,
                    state: status === 409 ? ('conflict' as const) : ('unknown' as const),
                }
                saveCreditAdjustment(unresolved)
                setAdjustment(unresolved)
                setNotice(status === 409 ? copy.conflict : copy.unknown)
            } else {
                setUnknownSet(amount)
                setNotice(copy.setUnknown)
            }
        } finally {
            if (current()) {
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
        abandon: () => {
            if (!lifetime.current.pending && adjustment && clearCreditAdjustment(membershipId)) {
                setAdjustment(null)
                setNotice(copy.abandoned)
                setFormVersion(value => value + 1)
            }
        },
    }
}
