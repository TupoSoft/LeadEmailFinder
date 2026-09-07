import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ForbiddenPage } from '../app/AuthRoutes'
import { useDocumentTitle } from '../app/useDocumentTitle'
import { billingCopy } from '../content/billing'
import { useAuth } from '../features/auth/use-auth'
import { BalancePanel, CreditPacksPanel, PurchaseHistoryPanel } from '../features/billing/BillingPanels'
import { clearCheckoutHint, readCheckoutHint } from '../features/billing/checkout-return-hint'
import {
    useBillingQueries,
    useBrowserAvailability,
    useCheckout,
    useReturnPolling,
} from '../features/billing/use-billing'
import styles from '../features/billing/BillingView.module.css'
import action from '../shared/Action.module.css'

function BillingContent({
    organizationId,
    canManage,
    returned,
}: {
    organizationId: string
    canManage: boolean
    returned: boolean
}) {
    useDocumentTitle(`${billingCopy.title} | Lead Email Finder`)
    const location = useLocation()
    const [hint] = useState(() => (returned ? readCheckoutHint(location.search) : undefined))
    const notice = useRef<HTMLElement>(null)
    const queries = useBillingQueries(organizationId)
    const checkout = useCheckout(queries)
    const { available, online } = useBrowserAvailability()
    const purchase = hint ? queries.purchases.data?.find(item => item.id === hint) : undefined
    const pending = returned && purchase?.status === 'pending'
    const pollingStopped = useReturnPolling(pending, queries.refresh, available)
    const returnedCopy = billingCopy.returned[purchase?.status ?? 'unknown']

    useEffect(() => {
        if (returned) notice.current?.focus()
    }, [returned])
    useEffect(() => {
        if (returned && purchase && purchase.status !== 'pending') clearCheckoutHint()
    }, [returned, purchase])

    return (
        <>
            <header className={styles.header}>
                <h1>{billingCopy.title}</h1>
                <p>{billingCopy.description}</p>
            </header>
            {returned ? (
                <section ref={notice} tabIndex={-1} className={styles.notice} aria-labelledby="checkout-return-heading">
                    <div aria-live="polite">
                        <h2 id="checkout-return-heading">{returnedCopy.title}</h2>
                        <p>{returnedCopy.description}</p>
                    </div>
                    {pending ? (
                        <p>
                            {!available
                                ? billingCopy.paused
                                : pollingStopped
                                  ? billingCopy.pollingStopped
                                  : billingCopy.polling}
                        </p>
                    ) : null}
                    <button
                        type="button"
                        className={`${action.action} ${action.secondary}`}
                        disabled={!online || queries.summary.isFetching || queries.purchases.isFetching}
                        onClick={() => void queries.refresh()}
                    >
                        {billingCopy.refresh}
                    </button>
                </section>
            ) : null}
            {!online ? <p role="status">{billingCopy.offline}</p> : null}
            <BalancePanel query={queries.summary} />
            <CreditPacksPanel query={queries.packs} canManage={canManage} checkout={checkout} online={online} />
            <PurchaseHistoryPanel query={queries.purchases} />
        </>
    )
}

export function BillingPage({ returned = false }: { returned?: boolean }) {
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    const { account } = state
    if (!account.capabilities.includes('billing.read')) return <ForbiddenPage />
    return (
        <BillingContent
            key={`${account.organization.id}:${returned}`}
            organizationId={account.organization.id}
            canManage={account.capabilities.includes('billing.manage')}
            returned={returned}
        />
    )
}
