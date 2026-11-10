import { billingCopy } from '../../content/billing'
import { ProductPanel } from '../../shared/ProductPanel'
import { SignalDetails } from '../../shared/SignalDetails'
import { Stack } from '../../shared/Stack'
import { SupportingText } from '../../shared/SupportingText'
import { formatCredits } from './format-billing'
import type { useBillingQueries } from './use-billing'
import action from '../../shared/Action.module.css'
import styles from './BillingView.module.css'

type Queries = ReturnType<typeof useBillingQueries>

const creditUnit = (amount: number) => (amount === 1 ? billingCopy.credit : billingCopy.credits.toLowerCase())

export function BalancePanel({ query, online }: { query: Queries['summary']; online: boolean }) {
    return (
        <ProductPanel
            title={billingCopy.balance}
            description={billingCopy.balanceDescription}
            pending={query.isPending}
            refreshing={query.isFetching}
            failed={query.isError}
            retry={() => void query.refetch()}
            reserveContent
            headerAction={
                <button
                    type="button"
                    className={`${action.action} ${action.secondary}`}
                    disabled={!online || query.isFetching}
                    onClick={() => void query.refetch()}
                >
                    {billingCopy.refresh}
                </button>
            }
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
