import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/api-error'
import { ForbiddenPage } from '../app/AuthRoutes'
import { useDocumentTitle } from '../app/useDocumentTitle'
import { useAuth } from '../features/auth/use-auth'
import { BatchResultDownload } from '../features/verification/BatchResultDownload'
import type { BatchVerificationStatus } from '../features/verification/batch-verification-api'
import { useBatchVerificationJob } from '../features/verification/use-batch-verification'
import { batchVerificationCopy as copy } from '../features/verification/batch-verification-copy'
import { verificationCopy } from '../features/verification/verification-copy'
import { isVerificationId } from '../features/verification/verification-api'
import { ProgressIndicator } from '../shared/ProgressIndicator'
import { SignalDetails } from '../shared/SignalDetails'
import { StateMessage } from '../shared/StateMessage'
import action from '../shared/Action.module.css'
import form from '../shared/Form.module.css'
import styles from '../features/verification/VerificationView.module.css'

function FreshFileLink() {
    const { state } = useAuth()
    return state.status === 'authenticated' && state.account.capabilities.includes('verification.run') ? (
        <Link className={`${action.action} ${action.secondary}`} to="/app/verifications/batches/new">
            {copy.fresh}
        </Link>
    ) : null
}

function JobContent({
    organizationId,
    id,
    canReadBilling,
}: {
    organizationId: string
    id: string
    canReadBilling: boolean
}) {
    const { query, online, available, refresh, pollingStopped } = useBatchVerificationJob(organizationId, id)
    const lastConfirmed = useRef<BatchVerificationStatus | null>(null)
    useEffect(() => {
        if (query.data && query.data.status !== 'unavailable') lastConfirmed.current = query.data
    }, [query.data])
    const notFound = query.error instanceof ApiError && query.error.status === 404
    const data = notFound ? undefined : query.data
    const stateCopy = notFound
        ? copy.notFound
        : data
          ? data.status === 'failed' && data.failureCode
              ? copy.failures[data.failureCode]
              : copy.states[data.status]
          : query.isError
            ? copy.readError
            : copy.loading
    const title = notFound
        ? stateCopy.title
        : !online
          ? 'Batch verification offline'
          : query.isError && data
            ? 'Batch status out of date'
            : stateCopy.title
    useDocumentTitle(`${title} | Lead Email Finder`)
    const active = data?.status === 'queued' || data?.status === 'running'
    const counts = data?.status === 'unavailable' ? (lastConfirmed.current ?? data) : data
    const stale = Boolean(data && (!online || query.isError || data.status === 'unavailable'))
    return (
        <>
            <div className={styles.progress}>
                <header className={styles.header}>
                    <h1>{title}</h1>
                    {data && title !== stateCopy.title ? <p>Last confirmed status: {stateCopy.title}</p> : null}
                    <p>{stateCopy.description}</p>
                </header>
                <div
                    className={data?.status === 'completed' && online && !query.isError ? undefined : styles.status}
                    aria-live="polite"
                    aria-atomic="true"
                >
                    {!online ? (
                        <p>{copy.jobOffline}</p>
                    ) : query.isError && data ? (
                        <p>{copy.stale}</p>
                    ) : active ? (
                        <p>
                            {!available
                                ? verificationCopy.paused
                                : pollingStopped
                                  ? verificationCopy.stopped
                                  : verificationCopy.polling}
                        </p>
                    ) : null}
                    <span className={styles.announcement}>{data ? stateCopy.title : ''}</span>
                </div>
                {counts ? (
                    <section aria-label="Batch progress and counts">
                        {stale ? <p>{copy.staleCounts}</p> : null}
                        {active && counts.total === 0 ? <p>{copy.validating}</p> : null}
                        <ProgressIndicator label={copy.progress} value={counts.progress} />
                        <SignalDetails
                            entries={[
                                { label: 'Processed', value: counts.processed.toLocaleString('en') },
                                { label: 'Unprocessed', value: counts.unprocessed.toLocaleString('en') },
                                { label: 'Total', value: counts.total.toLocaleString('en') },
                            ]}
                        />
                    </section>
                ) : null}
                {data?.status === 'failed' && data.failureCode === 'insufficient_credits' ? (
                    <p>
                        {canReadBilling ? (
                            <Link to="/app/billing">{verificationCopy.billing}</Link>
                        ) : (
                            verificationCopy.owner
                        )}
                    </p>
                ) : null}
                <div className={`${form.actions} ${styles.jobActions}`}>
                    {!notFound ? (
                        <button
                            className={`${action.action} ${action.secondary}`}
                            type="button"
                            disabled={!online || query.isFetching}
                            aria-busy={query.isFetching}
                            onClick={refresh}
                        >
                            {verificationCopy.refresh}
                        </button>
                    ) : null}
                    {data?.status === 'failed' && data.failureCode === 'invalid_csv' ? <FreshFileLink /> : null}
                </div>
            </div>
            {data?.status === 'completed' ? <BatchResultDownload id={id} online={online} /> : null}
        </>
    )
}

export function BatchVerificationJobPage() {
    const { id = '' } = useParams()
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    if (!state.account.capabilities.includes('verification.read')) return <ForbiddenPage />
    if (!isVerificationId(id)) return <StateMessage {...copy.notFound} />
    return (
        <JobContent
            key={`${state.account.organization.id}:${id}`}
            organizationId={state.account.organization.id}
            id={id}
            canReadBilling={state.account.capabilities.includes('billing.read')}
        />
    )
}
