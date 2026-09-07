import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import { organizationRoleLabels } from '../../content/organization'
import { signInHref } from '../auth/destination'
import { AuthContext } from '../auth/auth-context'
import { takeInvitationToken } from './invitation-bootstrap'
import {
    invitationApi,
    InvitationRequestError,
    type InvitationApi,
    type InvitationFailure,
    type InvitationPreview,
} from './invitation-api'
import { invitationCopy as copy } from './invitation-copy'
import action from '../../shared/Action.module.css'
import form from '../../shared/Form.module.css'
import styles from './InvitationPage.module.css'

type View =
    | { status: 'loading' | 'missing' | 'accepted' }
    | { status: 'pending' | 'accepting'; preview: InvitationPreview }
    | { status: 'failed'; reason: InvitationFailure }

export function InvitationPage({ api = invitationApi }: { api?: InvitationApi }) {
    const authSession = useContext(AuthContext)
    const [token] = useState(() => ({ current: takeInvitationToken() }))
    const generation = useRef(0)
    const controller = useRef(new AbortController())
    const password = useRef<HTMLInputElement>(null)
    const heading = useRef<HTMLHeadingElement>(null)
    const [view, setView] = useState<View>({ status: token.current ? 'loading' : 'missing' })
    const [invalid, setInvalid] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    useDocumentTitle(`${copy.title} | Lead Email Finder`)

    const clear = useCallback(() => {
        generation.current++
        controller.current.abort()
        token.current = undefined
        if (password.current) password.current.value = ''
    }, [token])

    useLayoutEffect(() => {
        const currentGeneration = generation.current
        if (token.current) {
            void api
                .preview(token.current, controller.current.signal)
                .then(preview => {
                    if (currentGeneration === generation.current) setView({ status: 'pending', preview })
                })
                .catch((error: unknown) => {
                    if (currentGeneration !== generation.current) return
                    clear()
                    setView({
                        status: 'failed',
                        reason: error instanceof InvitationRequestError ? error.reason : 'unavailable',
                    })
                })
        }
        const hide = () => {
            clear()
            flushSync(() => {
                setView({ status: 'missing' })
                setShowPassword(false)
                setInvalid(false)
            })
        }
        const show = (event: PageTransitionEvent) => {
            if (event.persisted) hide()
        }
        // A public request has no cookie authority, but a session boundary still
        // invalidates this document's ephemeral preview and in-flight settlement.
        const unsubscribe = authSession?.subscribe(hide)
        window.addEventListener('pagehide', hide)
        window.addEventListener('pageshow', show)
        return () => {
            clear()
            unsubscribe?.()
            window.removeEventListener('pagehide', hide)
            window.removeEventListener('pageshow', show)
        }
    }, [api, authSession, clear, token])

    useEffect(() => {
        if (view.status !== 'loading' && view.status !== 'accepting') heading.current?.focus()
    }, [view.status])

    async function accept() {
        if (view.status !== 'pending' || !token.current || !password.current) return
        if (password.current.value.length < 12) {
            setInvalid(true)
            password.current.focus()
            return
        }
        const currentGeneration = generation.current
        const operation = api.accept(token.current, password.current.value, controller.current.signal)
        password.current.value = ''
        setInvalid(false)
        setShowPassword(false)
        setView({ status: 'accepting', preview: view.preview })
        try {
            await operation
            if (currentGeneration !== generation.current) return
            clear()
            setView({ status: 'accepted' })
        } catch (error) {
            if (currentGeneration !== generation.current) return
            clear()
            setView({
                status: 'failed',
                reason: error instanceof InvitationRequestError ? error.reason : 'unavailable',
            })
        }
    }

    const title =
        view.status === 'missing'
            ? copy.missing
            : view.status === 'accepted'
              ? copy.accepted
              : view.status === 'failed'
                ? copy.errors[view.reason].title
                : copy.title
    const detail =
        view.status === 'missing'
            ? copy.missingDetail
            : view.status === 'accepted'
              ? copy.acceptedDetail
              : view.status === 'failed'
                ? copy.errors[view.reason].detail
                : copy.intro

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <Link to="/" className={styles.brand}>
                    Lead Email Finder
                </Link>
            </header>
            <main className={styles.main} aria-busy={view.status === 'loading' || view.status === 'accepting'}>
                <h1 ref={heading} tabIndex={-1}>
                    {title}
                </h1>
                <p>{detail}</p>
                {view.status === 'loading' ? <p role="status">{copy.loading}</p> : null}
                {view.status === 'pending' || view.status === 'accepting' ? (
                    <>
                        <dl className={styles.details}>
                            <div>
                                <dt>{copy.organization}</dt>
                                <dd>{view.preview.organizationName}</dd>
                            </div>
                            <div>
                                <dt>{copy.email}</dt>
                                <dd>{view.preview.email}</dd>
                            </div>
                            <div>
                                <dt>{copy.role}</dt>
                                <dd>{organizationRoleLabels[view.preview.role]}</dd>
                            </div>
                            <div>
                                <dt>{copy.expiry}</dt>
                                <dd>
                                    {new Intl.DateTimeFormat('en', {
                                        dateStyle: 'medium',
                                        timeStyle: 'short',
                                        timeZone: 'UTC',
                                    }).format(new Date(view.preview.expiresAt))}
                                </dd>
                            </div>
                        </dl>
                        <form
                            noValidate
                            className={styles.form}
                            onSubmit={event => {
                                event.preventDefault()
                                void accept()
                            }}
                        >
                            <div className={form.field}>
                                <label className={form.label} htmlFor="invitation-password">
                                    {copy.password}
                                </label>
                                <input
                                    ref={password}
                                    id="invitation-password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    className={form.control}
                                    autoComplete="new-password"
                                    minLength={12}
                                    required
                                    disabled={view.status === 'accepting'}
                                    aria-invalid={invalid}
                                    aria-describedby="password-help password-error"
                                />
                                <p className={form.help} id="password-help">
                                    {copy.passwordHint}
                                </p>
                                <p className={form.error} id="password-error" aria-live="polite">
                                    {invalid ? copy.passwordError : ''}
                                </p>
                            </div>
                            <div className={form.actions}>
                                <button
                                    className={`${action.action} ${action.secondary}`}
                                    type="button"
                                    aria-pressed={showPassword}
                                    disabled={view.status === 'accepting'}
                                    onClick={() => setShowPassword(value => !value)}
                                >
                                    {showPassword ? copy.hide : copy.show}
                                </button>
                                <button className={action.action} type="submit" disabled={view.status === 'accepting'}>
                                    {copy.accept}
                                </button>
                            </div>
                            <div className={styles.feedback} role="status">
                                {view.status === 'accepting' ? copy.accepting : ''}
                            </div>
                            <button
                                className={`${action.action} ${action.secondary}`}
                                type="button"
                                onClick={() => {
                                    clear()
                                    setView({ status: 'missing' })
                                }}
                            >
                                {copy.cancel}
                            </button>
                        </form>
                    </>
                ) : view.status !== 'loading' ? (
                    <div className={form.actions}>
                        <a className={action.action} href={signInHref()}>
                            {copy.signIn}
                        </a>
                        <Link className={`${action.action} ${action.secondary}`} to="/">
                            {copy.home}
                        </Link>
                    </div>
                ) : null}
            </main>
        </div>
    )
}
