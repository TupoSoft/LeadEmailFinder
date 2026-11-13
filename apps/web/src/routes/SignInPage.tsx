import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { ApiError } from '../api/api-error'
import { ApplicationFrame } from '../app/ApplicationFrame'
import { signInCopy } from '../content/auth-shell'
import { safeDestination } from '../features/auth/destination'
import { requestMagicLink } from '../features/auth/magic-link'
import { useAuth } from '../features/auth/use-auth'
import { Stack } from '../shared/Stack'
import { StateMessage } from '../shared/StateMessage'
import { SupportingText } from '../shared/SupportingText'
import { useBrowserAvailability } from '../shared/use-browser-availability'
import { useRetryTime } from '../shared/use-retry-time'
import action from '../shared/Action.module.css'
import form from '../shared/Form.module.css'
import styles from './SignInPage.module.css'

export function SignInPage() {
    const { api } = useAuth()
    const location = useLocation()
    const parameters = new URLSearchParams(location.search)
    const destination = safeDestination(parameters.get('destination'))
    const [email, setEmail] = useState('')
    const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null)
    const [pending, setPending] = useState(false)
    const [invalidEmail, setInvalidEmail] = useState(false)
    const [feedback, setFeedback] = useState<string | null>(() =>
        parameters.has('error') ? signInCopy.invalidLink : null,
    )
    const [retryAt, setRetryAt] = useState<number>()
    const request = useRef<AbortController | null>(null)
    const mounted = useRef(true)
    const emailInput = useRef<HTMLInputElement>(null)
    const confirmation = useRef<HTMLDivElement>(null)
    const { online } = useBrowserAvailability()
    const rateLimited = useRetryTime(retryAt)
    const disabled = pending || rateLimited || !online

    useEffect(() => {
        mounted.current = true

        return () => {
            mounted.current = false
            request.current?.abort()
        }
    }, [])

    useEffect(() => {
        if (confirmationEmail) {
            confirmation.current?.focus()
        } else {
            emailInput.current?.focus()
        }
    }, [confirmationEmail])

    async function sendLink(address: string): Promise<void> {
        if (request.current || rateLimited || !online) return

        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 20_000)
        request.current = controller
        setPending(true)
        setFeedback(null)

        try {
            await requestMagicLink(api, address, destination, controller.signal)

            if (controller.signal.aborted) return

            setConfirmationEmail(address)
            setFeedback(confirmationEmail ? signInCopy.resent : null)
        } catch (error: unknown) {
            if (!mounted.current) return

            // Errors contain only public metadata; raw provider responses never become page content.
            if (error instanceof ApiError && error.status === 429) {
                setRetryAt(error.retryAt ?? Date.now() + 60_000)
                setFeedback(signInCopy.rateLimited)
            } else if (error instanceof ApiError && error.status === 503) {
                setFeedback(signInCopy.deliveryError)
            } else {
                setFeedback(signInCopy.requestError)
            }
        } finally {
            window.clearTimeout(timeout)
            request.current = null

            if (mounted.current) {
                setPending(false)
            }
        }
    }

    function submit(event: SubmitEvent<HTMLFormElement>): void {
        event.preventDefault()

        if (disabled) return

        const address = email.trim().toLowerCase()
        const field = emailInput.current

        if (!address || !field?.validity.valid || address.length > 254) {
            setInvalidEmail(true)
            field?.focus()
            return
        }

        setInvalidEmail(false)
        void sendLink(address)
    }

    return (
        <ApplicationFrame>
            <StateMessage
                title={confirmationEmail ? signInCopy.checkTitle : signInCopy.title}
                description={confirmationEmail ? signInCopy.checkDescription : signInCopy.description}
                pending={pending}
            >
                <div className={styles.content}>
                    <Stack>
                        {!online ? <SupportingText role="status">{signInCopy.offline}</SupportingText> : null}
                        {confirmationEmail ? (
                            <Stack>
                                <div ref={confirmation} tabIndex={-1}>
                                    <Stack gap="control">
                                        <p className={styles.address}>{confirmationEmail}</p>
                                        <SupportingText>{signInCopy.checkHelp}</SupportingText>
                                    </Stack>
                                </div>
                                <div className={form.actions}>
                                    <button
                                        className={action.action}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => void sendLink(confirmationEmail)}
                                    >
                                        {signInCopy.resend}
                                    </button>
                                    <button
                                        className={`${action.action} ${action.secondary}`}
                                        type="button"
                                        disabled={pending}
                                        onClick={() => {
                                            setConfirmationEmail(null)
                                            setFeedback(null)
                                        }}
                                    >
                                        {signInCopy.changeEmail}
                                    </button>
                                </div>
                            </Stack>
                        ) : (
                            <form noValidate onSubmit={submit} aria-busy={pending}>
                                <Stack>
                                    <div className={form.field}>
                                        <label className={form.label} htmlFor="sign-in-email">
                                            {signInCopy.email}
                                        </label>
                                        <input
                                            ref={emailInput}
                                            className={form.control}
                                            id="sign-in-email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            required
                                            maxLength={254}
                                            value={email}
                                            disabled={pending}
                                            aria-invalid={invalidEmail}
                                            aria-describedby={invalidEmail ? 'email-help email-error' : 'email-help'}
                                            onChange={event => {
                                                setEmail(event.target.value)
                                                setInvalidEmail(false)
                                            }}
                                        />
                                        <SupportingText id="email-help">{signInCopy.help}</SupportingText>
                                        {invalidEmail ? (
                                            <p id="email-error" className={form.error} role="alert">
                                                {signInCopy.invalidEmail}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className={form.actions}>
                                        <button className={action.action} type="submit" disabled={disabled}>
                                            {signInCopy.submit}
                                        </button>
                                    </div>
                                </Stack>
                            </form>
                        )}
                        <div aria-live="polite">
                            {pending ? <SupportingText>{signInCopy.pending}</SupportingText> : null}
                            {feedback ? <SupportingText role="status">{feedback}</SupportingText> : null}
                        </div>
                    </Stack>
                </div>
            </StateMessage>
        </ApplicationFrame>
    )
}
