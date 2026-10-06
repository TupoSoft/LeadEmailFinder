import { useSearchParams } from 'react-router-dom'
import { billingCopy } from '../../content/billing'
import { ProductPanel } from '../../shared/ProductPanel'
import { SignalDetails } from '../../shared/SignalDetails'
import { Stack } from '../../shared/Stack'
import { SupportingText } from '../../shared/SupportingText'
import action from '../../shared/Action.module.css'
import type { CreditPurchase } from './billing-api'
import { formatCredits, formatMoney, formatPurchaseDate } from './format-billing'
import type { useBillingQueries, useCheckout } from './use-billing'
import styles from './BillingView.module.css'

type Queries = ReturnType<typeof useBillingQueries>

const creditUnit = (amount: number) => (amount === 1 ? billingCopy.credit : billingCopy.credits.toLowerCase())

export function BalancePanel({ query }: { query: Queries['summary'] }) {
    return (
        <ProductPanel
            title={billingCopy.balance}
            description={billingCopy.balanceDescription}
            pending={query.isPending}
            refreshing={query.isFetching}
            failed={query.isError}
            retry={() => void query.refetch()}
            reserveContent
        >
            {query.data ? (
                <Stack gap="content" aria-live="polite" aria-atomic="true">
                    <Stack gap="control">
                        <p>{billingCopy.available}</p>
                        <p className={styles.balance}>
                            <strong>{formatCredits(query.data.available)}</strong> {creditUnit(query.data.available)}
                        </p>
                        <SignalDetails
                            variant="balance"
                            entries={[
                                {
                                    label: billingCopy.reserved,
                                    value: `${formatCredits(query.data.reserved)} ${creditUnit(query.data.reserved)}`,
                                },
                                {
                                    label: billingCopy.total,
                                    value: `${formatCredits(query.data.balance)} ${creditUnit(query.data.balance)}`,
                                },
                            ]}
                        />
                    </Stack>
                    <SupportingText>{billingCopy.reservationExplanation}</SupportingText>
                </Stack>
            ) : null}
        </ProductPanel>
    )
}

export function CreditPacksPanel({
    query,
    canManage,
    checkout,
    online,
}: {
    query: Queries['packs']
    canManage: boolean
    checkout: ReturnType<typeof useCheckout>
    online: boolean
}) {
    return (
        <ProductPanel
            title={billingCopy.catalog}
            description={billingCopy.catalogDescription}
            pending={query.isPending}
            refreshing={query.isFetching}
            failed={query.isError}
            retry={() => void query.refetch()}
            feedback={
                <>
                    {checkout.notice ? <p>{checkout.notice}</p> : null}
                    {checkout.ready ? (
                        <button
                            type="button"
                            className={action.action}
                            disabled={!online}
                            onClick={checkout.continueCheckout}
                        >
                            {billingCopy.continueCheckout}
                        </button>
                    ) : null}
                    {checkout.needsHistory ? (
                        <>
                            <p>{billingCopy.refreshRequired}</p>
                            <button
                                type="button"
                                className={`${action.action} ${action.secondary}`}
                                disabled={checkout.recovering || !online}
                                onClick={() => void checkout.refreshAfterFailure()}
                            >
                                {billingCopy.refresh}
                            </button>
                        </>
                    ) : null}
                </>
            }
        >
            {!canManage ? <p>{billingCopy.readOnly}</p> : null}
            {query.data?.length === 0 ? <p>{billingCopy.emptyCatalog}</p> : null}
            <ul className={styles.packs}>
                {query.data?.map(pack => (
                    <li key={pack.id}>
                        <div>
                            <strong>{formatCredits(pack.credits)} credits</strong>
                            <p>{formatMoney(pack.amountMinor, pack.currency)}</p>
                        </div>
                        {canManage ? (
                            <button
                                type="button"
                                className={action.action}
                                disabled={checkout.selectedPack === pack.id || checkout.needsHistory || !online}
                                aria-busy={checkout.selectedPack === pack.id}
                                aria-label={`Buy ${formatCredits(pack.credits)} credits for ${formatMoney(pack.amountMinor, pack.currency)}`}
                                onClick={() => checkout.start(pack.id)}
                            >
                                Buy credits
                            </button>
                        ) : null}
                    </li>
                ))}
            </ul>
        </ProductPanel>
    )
}

const pageSize = 10

function PurchaseRow({ purchase }: { purchase: CreditPurchase }) {
    return (
        <tr>
            <td>
                <span className={styles.mobileLabel} aria-hidden="true">
                    {billingCopy.date}
                </span>
                <time dateTime={purchase.createdAt}>{formatPurchaseDate(purchase.createdAt)}</time>
            </td>
            <td>
                <span className={styles.mobileLabel} aria-hidden="true">
                    {billingCopy.credits}
                </span>
                {formatCredits(purchase.credits)}
            </td>
            <td>
                <span className={styles.mobileLabel} aria-hidden="true">
                    {billingCopy.amount}
                </span>
                {formatMoney(purchase.amountMinor, purchase.currency)}
            </td>
            <td>
                <span className={styles.mobileLabel} aria-hidden="true">
                    {billingCopy.status}
                </span>
                <span className={styles.status}>{billingCopy.statuses[purchase.status]}</span>
            </td>
        </tr>
    )
}

export function PurchaseHistoryPanel({ query }: { query: Queries['purchases'] }) {
    const [params, setParams] = useSearchParams()
    const purchases = query.data ?? []
    const lastPage = Math.max(1, Math.ceil(purchases.length / pageSize))
    const suppliedPage = Number(params.get('page') ?? 1)
    const page = Number.isSafeInteger(suppliedPage) && suppliedPage > 0 ? Math.min(suppliedPage, lastPage) : 1
    const start = (page - 1) * pageSize
    function goToPage(nextPage: number) {
        const next = new URLSearchParams(params)
        if (nextPage === 1) next.delete('page')
        else next.set('page', String(nextPage))
        setParams(next)
    }
    return (
        <ProductPanel
            title={billingCopy.history}
            description={billingCopy.historyDescription}
            pending={query.isPending}
            refreshing={query.isFetching}
            failed={query.isError}
            retry={() => void query.refetch()}
            reserveContent
        >
            {query.data?.length === 0 ? <p>{billingCopy.emptyHistory}</p> : null}
            {purchases.length > 0 ? (
                <>
                    <table className={styles.history}>
                        <caption
                            className={styles.caption}
                        >{`Purchases ${start + 1}–${Math.min(start + pageSize, purchases.length)} of ${purchases.length}`}</caption>
                        <thead>
                            <tr>
                                {[billingCopy.date, billingCopy.credits, billingCopy.amount, billingCopy.status].map(
                                    label => (
                                        <th key={label} scope="col">
                                            {label}
                                        </th>
                                    ),
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {purchases.slice(start, start + pageSize).map(purchase => (
                                <PurchaseRow key={purchase.id} purchase={purchase} />
                            ))}
                        </tbody>
                    </table>
                    {lastPage > 1 ? (
                        <nav className={styles.pagination} aria-label="Purchase history pages">
                            <button
                                type="button"
                                className={`${action.action} ${action.secondary}`}
                                disabled={page === 1}
                                onClick={() => goToPage(page - 1)}
                            >
                                {billingCopy.previous}
                            </button>
                            <p>{`Page ${page} of ${lastPage}`}</p>
                            <button
                                type="button"
                                className={`${action.action} ${action.secondary}`}
                                disabled={page === lastPage}
                                onClick={() => goToPage(page + 1)}
                            >
                                {billingCopy.next}
                            </button>
                        </nav>
                    ) : null}
                </>
            ) : null}
        </ProductPanel>
    )
}
