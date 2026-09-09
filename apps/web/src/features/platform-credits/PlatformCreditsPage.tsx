import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { ApiError } from '../../api/api-error'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import { ProductPanel } from '../../shared/ProductPanel'
import { SignalDetails } from '../../shared/SignalDetails'
import { useBrowserAvailability } from '../../shared/use-browser-availability'
import action from '../../shared/Action.module.css'
import form from '../../shared/Form.module.css'
import styles from '../service-clients/ServiceClientsView.module.css'
import { useAuth } from '../auth/use-auth'
import { formatCredits } from '../billing/format-billing'
import { TeamDialog } from '../team/TeamDialog'
import { creditsCopy as copy } from './platform-credits-copy'
import { usePlatformCredits } from './use-platform-credits'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const directoryRoute = '/app/platform/organizations'
type Confirmation = { kind: 'add' | 'set'; amount: number } | { kind: 'abandon' }

function CreditForm({
    kind,
    disabled,
    review,
}: {
    kind: 'add' | 'set'
    disabled: boolean
    review: (amount: number) => void
}) {
    const id = useId()
    const [invalid, setInvalid] = useState(false)
    const isAdd = kind === 'add'
    return (
        <form
            className={styles.createForm}
            noValidate
            onSubmit={event => {
                event.preventDefault()
                if (disabled) return
                const input = event.currentTarget.elements.namedItem('amount') as HTMLInputElement
                const amount = Number(input.value)
                if (
                    !/^\d+$/.test(input.value) ||
                    !Number.isInteger(amount) ||
                    amount < (isAdd ? 1 : 0) ||
                    amount > 2147483647
                ) {
                    setInvalid(true)
                    input.focus()
                    return
                }
                setInvalid(false)
                review(amount)
            }}
        >
            <div className={form.field}>
                <label className={form.label} htmlFor={id}>
                    {isAdd ? copy.addAmount : copy.setAmount}
                </label>
                <input
                    id={id}
                    name="amount"
                    className={form.control}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={disabled}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${id}-error` : undefined}
                />
                {invalid ? (
                    <p id={`${id}-error`} className={form.error}>
                        {isAdd ? copy.addInvalid : copy.setInvalid}
                    </p>
                ) : null}
            </div>
            <div className={form.actions}>
                <button type="submit" className={action.action} disabled={disabled}>
                    {isAdd ? copy.reviewAdd : copy.reviewSet}
                </button>
            </div>
        </form>
    )
}

function CreditsContent({ membershipId, organizationId }: { membershipId: string; organizationId: string }) {
    useDocumentTitle(`${copy.title} | Lead Email Finder`)
    const location = useLocation()
    const feature = usePlatformCredits(membershipId, organizationId)
    const { online } = useBrowserAvailability()
    const feedback = useRef<HTMLParagraphElement>(null)
    useLayoutEffect(() => {
        if (feature.notice && feature.pending === null) feedback.current?.focus()
    }, [feature.notice, feature.pending])
    const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
    const selected: unknown = location.state
    const selectedName =
        typeof selected === 'object' &&
        selected !== null &&
        'organization' in selected &&
        typeof selected.organization === 'object' &&
        selected.organization !== null &&
        'id' in selected.organization &&
        selected.organization.id === organizationId &&
        'name' in selected.organization &&
        typeof selected.organization.name === 'string' &&
        selected.organization.name.length <= 200
            ? selected.organization.name
            : undefined
    const name = feature.organization.data?.name ?? selectedName
    const blocked = !online || !feature.ready || feature.pending !== null
    const detailError = feature.organization.error
    const detailMessage =
        detailError instanceof ApiError && detailError.status === 404
            ? copy.missing
            : detailError instanceof ApiError && detailError.status === 403
              ? copy.denied
              : copy.unavailable
    const details = [
        { label: copy.organization, value: feature.organization.data?.name ?? '' },
        { label: copy.organizationId, value: organizationId },
        { label: copy.current, value: feature.balance.data ? formatCredits(feature.balance.data.balance) : '' },
    ]
    return (
        <>
            <header className={styles.header}>
                <Link to={directoryRoute}>{copy.back}</Link>
                <h1>{copy.title}</h1>
                <p>{copy.description}</p>
                {!feature.organization.isError && name ? <p>{name}</p> : null}
            </header>
            {!online ? <p role="status">{copy.offline}</p> : null}
            {feature.organization.isError ? (
                <div className={styles.feedback} role="status">
                    <p>{detailMessage}</p>
                    <button
                        type="button"
                        className={`${action.action} ${action.secondary}`}
                        disabled={!online || feature.organization.isFetching}
                        onClick={() => void feature.organization.refetch()}
                    >
                        {copy.retryDetails}
                    </button>
                </div>
            ) : (
                <ProductPanel
                    title={copy.balance}
                    description={copy.balanceDescription}
                    pending={feature.organization.isPending || feature.balance.isPending}
                    refreshing={feature.organization.isFetching || feature.balance.isFetching}
                    failed={feature.balance.isError}
                    retry={() => void feature.refresh()}
                    reserveContent
                    headerAction={
                        <button
                            type="button"
                            className={`${action.action} ${action.secondary}`}
                            disabled={blocked}
                            onClick={() => void feature.refresh()}
                        >
                            {copy.refresh}
                        </button>
                    }
                    feedback={
                        <p ref={feedback} tabIndex={-1}>
                            {feature.pending === 'add'
                                ? copy.adding
                                : feature.pending === 'set'
                                  ? copy.setting
                                  : feature.notice === copy.conflict
                                    ? ''
                                    : feature.notice}
                        </p>
                    }
                >
                    {feature.organization.isSuccess &&
                    !feature.organization.isFetching &&
                    feature.balance.data &&
                    !feature.balance.isError ? (
                        <SignalDetails entries={details} />
                    ) : null}
                </ProductPanel>
            )}
            {feature.organization.isSuccess ? (
                <>
                    <ProductPanel
                        title={copy.add}
                        description={copy.addDescription}
                        pending={false}
                        refreshing={false}
                        failed={false}
                        retry={() => {}}
                        feedback={
                            feature.adjustment && feature.ready && feature.pending === null ? (
                                <>
                                    <p>
                                        {feature.expired
                                            ? copy.expired
                                            : feature.adjustment.state === 'conflict'
                                              ? copy.conflict
                                              : feature.restored
                                                ? copy.restored
                                                : copy.unresolved}
                                    </p>
                                    <p>
                                        {copy.addAmount}: {formatCredits(feature.adjustment.amount)}
                                    </p>
                                    <p>{copy.recoveryLimit}</p>
                                    <div className={form.actions}>
                                        {!feature.expired && feature.adjustment.state !== 'conflict' ? (
                                            <button
                                                type="button"
                                                className={action.action}
                                                disabled={blocked}
                                                onClick={() => void feature.retry()}
                                            >
                                                {copy.retry}
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            className={`${action.action} ${action.secondary}`}
                                            disabled={blocked}
                                            onClick={() => setConfirmation({ kind: 'abandon' })}
                                        >
                                            {copy.abandon}
                                        </button>
                                    </div>
                                </>
                            ) : null
                        }
                    >
                        <CreditForm
                            key={`add-${feature.formVersion}`}
                            kind="add"
                            disabled={blocked || feature.adjustment !== null}
                            review={amount => setConfirmation({ kind: 'add', amount })}
                        />
                    </ProductPanel>
                    <ProductPanel
                        title={copy.set}
                        description={copy.setDescription}
                        pending={false}
                        refreshing={false}
                        failed={false}
                        retry={() => {}}
                    >
                        <CreditForm
                            key={`set-${feature.formVersion}`}
                            kind="set"
                            disabled={blocked || feature.adjustment !== null}
                            review={amount => setConfirmation({ kind: 'set', amount })}
                        />
                    </ProductPanel>
                </>
            ) : null}
            {confirmation && feature.ready ? (
                <TeamDialog
                    title={
                        confirmation.kind === 'abandon'
                            ? copy.abandon
                            : confirmation.kind === 'add'
                              ? copy.confirmAdd
                              : copy.confirmSet
                    }
                    description={
                        confirmation.kind === 'abandon'
                            ? copy.abandonDescription
                            : confirmation.kind === 'add'
                              ? copy.confirmAddDescription
                              : copy.confirmSetDescription
                    }
                    onDismiss={() => setConfirmation(null)}
                >
                    <SignalDetails
                        entries={[
                            ...details,
                            ...(confirmation.kind === 'abandon'
                                ? []
                                : [
                                      {
                                          label: confirmation.kind === 'add' ? copy.addAmount : copy.setAmount,
                                          value: formatCredits(confirmation.amount),
                                      },
                                  ]),
                        ]}
                    />
                    {confirmation.kind === 'abandon' ? <p>{copy.recoveryLimit}</p> : null}
                    <div className={form.actions}>
                        <button
                            data-initial-focus
                            type="button"
                            className={`${action.action} ${action.secondary}`}
                            onClick={() => setConfirmation(null)}
                        >
                            {copy.cancel}
                        </button>
                        <button
                            type="button"
                            className={action.action}
                            disabled={blocked}
                            onClick={() => {
                                const confirmed = confirmation
                                setConfirmation(null)
                                if (confirmed.kind === 'abandon') feature.abandon()
                                else if (confirmed.kind === 'add') void feature.add(confirmed.amount)
                                else void feature.set(confirmed.amount)
                            }}
                        >
                            {confirmation.kind === 'abandon'
                                ? copy.acknowledgeAbandon
                                : confirmation.kind === 'add'
                                  ? copy.add
                                  : copy.set}
                        </button>
                    </div>
                </TeamDialog>
            ) : null}
        </>
    )
}

export function PlatformCreditsPage() {
    const { state } = useAuth()
    const { organizationId } = useParams()
    if (state.status !== 'authenticated') return null
    if (!state.account.capabilities.includes('platform.credits.manage')) return <Navigate replace to="/app/forbidden" />
    if (!organizationId || !uuid.test(organizationId)) return <Navigate replace to={directoryRoute} />
    return (
        <CreditsContent
            key={`${state.account.membership.id}:${organizationId}`}
            membershipId={state.account.membership.id}
            organizationId={organizationId.toLowerCase()}
        />
    )
}
