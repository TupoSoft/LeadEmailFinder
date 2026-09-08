import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ForbiddenPage } from '../app/AuthRoutes'
import { useDocumentTitle } from '../app/useDocumentTitle'
import { useAuth } from '../features/auth/use-auth'
import { useVerificationSubmission } from '../features/verification/use-verification'
import { verificationCopy as copy } from '../features/verification/verification-copy'
import { useBrowserAvailability } from '../shared/use-browser-availability'
import { ProductPanel } from '../shared/ProductPanel'
import action from '../shared/Action.module.css'
import form from '../shared/Form.module.css'
import styles from '../features/verification/VerificationView.module.css'

function VerificationForm({ organizationId, canReadBilling }: { organizationId: string; canReadBilling: boolean }) {
    const navigate = useNavigate()
    const { submission, start, resetReady } = useVerificationSubmission(
        organizationId,
        id => void navigate(`/app/verifications/${id}`),
    )
    const [email, setEmail] = useState('')
    const [invalid, setInvalid] = useState(false)
    const [acknowledged, setAcknowledged] = useState(false)
    const emailInput = useRef<HTMLInputElement>(null)
    const { online } = useBrowserAvailability()
    const pending = submission.phase === 'pending'
    const fieldError = invalid || submission.phase === 'invalid'
    const uncertain = submission.phase === 'uncertain'
    const title = uncertain
        ? copy.uncertainTitle
        : submission.phase === 'insufficient'
          ? 'Insufficient credits'
          : copy.title
    useDocumentTitle(`${title} | Lead Email Finder`)
    useEffect(() => {
        if (submission.phase === 'invalid') emailInput.current?.focus()
    }, [submission.phase])

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (pending || !online || submission.phase === 'ready') return
        const input = emailInput.current
        if (!email.trim() || !input?.validity.valid) {
            setInvalid(true)
            input?.focus()
            return
        }
        setInvalid(false)
        start(email.trim(), acknowledged)
        setAcknowledged(false)
    }

    return (
        <>
            <header className={styles.header}>
                <h1>{copy.title}</h1>
                <p>{copy.description}</p>
            </header>
            <ProductPanel
                title="Single email verification"
                description={copy.cost}
                pending={false}
                refreshing={false}
                failed={false}
                retry={() => undefined}
            >
                <form className={styles.form} noValidate onSubmit={submit} aria-busy={pending}>
                    <div className={form.field}>
                        <label className={form.label} htmlFor="verification-email">
                            {copy.email}
                        </label>
                        <input
                            ref={emailInput}
                            id="verification-email"
                            className={form.control}
                            type="email"
                            required
                            autoComplete="off"
                            spellCheck={false}
                            value={email}
                            disabled={pending}
                            aria-invalid={fieldError}
                            aria-describedby={fieldError ? 'verification-email-error' : undefined}
                            onChange={event => {
                                setEmail(event.target.value)
                                setInvalid(false)
                            }}
                        />
                        {fieldError ? (
                            <p id="verification-email-error" className={form.error}>
                                {copy.invalid}
                            </p>
                        ) : null}
                    </div>
                    <div className={styles.feedback} aria-live="polite">
                        {pending ? <p>{copy.pending}</p> : null}
                        {!online ? <p>{copy.formOffline}</p> : null}
                        {submission.phase === 'insufficient' ? (
                            <>
                                <h2>Insufficient credits</h2>
                                <p>{copy.insufficient}</p>
                                {canReadBilling ? (
                                    <Link className={`${action.action} ${action.secondary}`} to="/app/billing">
                                        {copy.billing}
                                    </Link>
                                ) : (
                                    <p>{copy.owner}</p>
                                )}
                            </>
                        ) : null}
                        {uncertain ? (
                            <>
                                <h2>{copy.uncertainTitle}</h2>
                                <p>{copy.uncertain}</p>
                            </>
                        ) : null}
                        {submission.phase === 'ready' ? <p>{copy.ready}</p> : null}
                    </div>
                    {uncertain ? (
                        <label className={styles.acknowledgment}>
                            <input
                                type="checkbox"
                                checked={acknowledged}
                                onChange={event => setAcknowledged(event.target.checked)}
                            />
                            {copy.acknowledge}
                        </label>
                    ) : null}
                    <div className={form.actions}>
                        {submission.phase === 'ready' ? (
                            <>
                                <Link className={action.action} to={`/app/verifications/${submission.id}`}>
                                    {copy.view}
                                </Link>
                                <button
                                    className={`${action.action} ${action.secondary}`}
                                    type="button"
                                    onClick={resetReady}
                                >
                                    {copy.another}
                                </button>
                            </>
                        ) : (
                            <button
                                className={action.action}
                                type="submit"
                                disabled={pending || !online || (uncertain && !acknowledged)}
                            >
                                {copy.submit}
                            </button>
                        )}
                    </div>
                </form>
            </ProductPanel>
        </>
    )
}

export function VerificationPage() {
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    const { account } = state
    if (!account.capabilities.includes('verification.run')) return <ForbiddenPage />
    return (
        <VerificationForm
            key={account.organization.id}
            organizationId={account.organization.id}
            canReadBilling={account.capabilities.includes('billing.read')}
        />
    )
}
