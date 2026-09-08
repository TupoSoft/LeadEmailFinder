import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../api/api-error'
import { ForbiddenPage } from '../app/AuthRoutes'
import { useDocumentTitle } from '../app/useDocumentTitle'
import { useAuth } from '../features/auth/use-auth'
import { useVerificationJob } from '../features/verification/use-verification'
import { isVerificationId } from '../features/verification/verification-api'
import { verificationCopy as copy } from '../features/verification/verification-copy'
import { VerificationResultView } from '../features/verification/VerificationResultView'
import { StateMessage } from '../shared/StateMessage'
import action from '../shared/Action.module.css'
import form from '../shared/Form.module.css'
import styles from '../features/verification/VerificationView.module.css'

function NewVerificationLink() {
    const { state } = useAuth()
    return state.status === 'authenticated' && state.account.capabilities.includes('verification.run') ? (
        <Link className={`${action.action} ${action.secondary}`} to="/app/verifications/new">
            {copy.another}
        </Link>
    ) : null
}

function JobContent({ organizationId, id }: { organizationId: string; id: string }) {
    const { query, online, available, refresh, pollingStopped } = useVerificationJob(organizationId, id)
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
                            disabled={!online || query.isFetching}
                            aria-busy={query.isFetching}
                            onClick={refresh}
                        >
                            {copy.refresh}
                        </button>
                    ) : null}
                    <NewVerificationLink />
                </div>
            </div>
            {data?.state === 'completed' ? <VerificationResultView result={data.result} /> : null}
        </>
    )
}

export function VerificationJobPage() {
    const { id = '' } = useParams()
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    if (!state.account.capabilities.includes('verification.read')) return <ForbiddenPage />
    if (!isVerificationId(id))
        return (
            <StateMessage {...copy.notFound}>
                <NewVerificationLink />
            </StateMessage>
        )
    return (
        <JobContent
            key={`${state.account.organization.id}:${id}`}
            organizationId={state.account.organization.id}
            id={id}
        />
    )
}
