import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/api-error'
import { useDocumentTitle } from '../app/useDocumentTitle'
import { useAuth } from '../features/auth/use-auth'
import { useVerificationJob } from '../features/verification/use-verification'
import { isVerificationId } from '../features/verification/verification-api'
import { verificationChargeReasons, verificationCopy as copy } from '../features/verification/verification-copy'
import { VerificationResultView } from '../features/verification/VerificationResultView'
import { VerificationChargeDetails } from '../shared/VerificationChargeDetails'
import { StateMessage } from '../shared/StateMessage'
import action from '../shared/Action.module.css'
import form from '../shared/Form.module.css'
import styles from '../features/verification/VerificationView.module.css'

function NewVerificationLink() {
    const { state } = useAuth()
    return state.status === 'authenticated' ? (
        <Link className={`${action.action} ${action.secondary}`} to="/app/verifications/new">
            {copy.another}
        </Link>
    ) : null
}

function JobContent({ userId, id }: { userId: string; id: string }) {
    const { query, online, available, refresh, pollingStopped } = useVerificationJob(userId, id)
    const notFound = query.error instanceof ApiError && query.error.status === 404
    const data = notFound ? undefined : query.data
    const stateCopy = notFound
        ? copy.notFound
        : data
          ? copy.states[data.state]
          : query.isError
            ? copy.readError
            : copy.loading
    const title = !online
        ? 'Verification offline'
        : query.isError && data
          ? 'Verification status out of date'
          : stateCopy.title
    useDocumentTitle(`${title} | Lead Email Finder`)
    const operation = data && 'operation' in data ? data.operation : undefined
    const active = data?.state === 'queued' || data?.state === 'running'
    return (
        <>
            <div className={data?.state === 'completed' ? undefined : styles.progress}>
                <header className={styles.header}>
                    <h1>{title}</h1>
                    {data && title !== stateCopy.title ? <p>Last confirmed status: {stateCopy.title}</p> : null}
                    <p>{stateCopy.description}</p>
                </header>
                <div
                    className={data?.state === 'completed' && online && !query.isError ? undefined : styles.status}
                    aria-live="polite"
                    aria-atomic="true"
                >
                    {!online ? (
                        <p>{copy.offline}</p>
                    ) : query.isError && data ? (
                        <p>{copy.stale}</p>
                    ) : active ? (
                        <p>{!available ? copy.paused : pollingStopped ? copy.stopped : copy.polling}</p>
                    ) : null}
                    <span className={styles.announcement}>{data ? copy.states[data.state].title : ''}</span>
                </div>
                <div className={form.actions}>
                    {!notFound ? (
                        <button
                            className={`${action.action} ${action.secondary}`}
                            type="button"
                            disabled={!online}
                            aria-disabled={!online || query.isFetching}
                            aria-busy={query.isFetching}
                            onClick={refresh}
                        >
                            {copy.refresh}
                        </button>
                    ) : null}
                    <NewVerificationLink />
                </div>
            </div>
            {data ? (
                <VerificationChargeDetails
                    billing={operation?.billing}
                    reason={operation?.billing.reason ? verificationChargeReasons[operation.billing.reason] : undefined}
                />
            ) : null}
            {data?.state === 'completed' ? <VerificationResultView result={data.result} operation={operation} /> : null}
        </>
    )
}

export function VerificationJobPage() {
    const { id = '' } = useParams()
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    if (!isVerificationId(id))
        return (
            <StateMessage {...copy.notFound}>
                <NewVerificationLink />
            </StateMessage>
        )
    return <JobContent key={`${state.account.user.id}:${id}`} userId={state.account.user.id} id={id} />
}
