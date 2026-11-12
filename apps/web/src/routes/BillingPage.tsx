import { useDocumentTitle } from '../app/useDocumentTitle'
import { billingCopy } from '../content/billing'
import { useAuth } from '../features/auth/use-auth'
import { BalancePanel } from '../features/billing/BillingPanels'
import { useBillingQueries } from '../features/billing/use-billing'
import { useBrowserAvailability } from '../shared/use-browser-availability'
import styles from '../features/billing/BillingView.module.css'

function BillingContent({ userId }: { userId: string }) {
    useDocumentTitle(`${billingCopy.title} | Lead Email Finder`)
    const queries = useBillingQueries(userId)
    const { online } = useBrowserAvailability()

    return (
        <>
            <header className={styles.header}>
                <h1>{billingCopy.title}</h1>
                <p>{billingCopy.description}</p>
            </header>
            {!online ? <p role="status">{billingCopy.offline}</p> : null}
            <BalancePanel query={queries.summary} online={online} />
        </>
    )
}

export function BillingPage() {
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    const { account } = state

    return <BillingContent key={account.user.id} userId={account.user.id} />
}
