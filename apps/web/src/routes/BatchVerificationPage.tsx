import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/api-error'
import { ForbiddenPage } from '../app/AuthRoutes'
import { useDocumentTitle } from '../app/useDocumentTitle'
import { useAuth } from '../features/auth/use-auth'
import { createBatchVerification } from '../features/verification/batch-verification-api'
import { batchVerificationCopy as copy } from '../features/verification/batch-verification-copy'
import { useBrowserAvailability } from '../shared/use-browser-availability'
import { ProductPanel } from '../shared/ProductPanel'
import { ProgressIndicator } from '../shared/ProgressIndicator'
import action from '../shared/Action.module.css'
import form from '../shared/Form.module.css'
import styles from '../features/verification/VerificationView.module.css'

const maxCsvBytes = 104857600
const fileSizeFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
function formatFileSize(bytes: number): string {
    return bytes < 1024
        ? `${bytes} bytes`
        : bytes < 1024 * 1024
          ? `${fileSizeFormat.format(bytes / 1024)} KB`
          : `${fileSizeFormat.format(bytes / (1024 * 1024))} MB`
}

function BatchForm() {
    const { api } = useAuth()
    const navigate = useNavigate()
    const { online } = useBrowserAvailability()
    const input = useRef<HTMLInputElement>(null)
    const uncertaintyHeading = useRef<HTMLHeadingElement>(null)
    // Files and in-flight bodies never enter the shared query or mutation caches.
    const file = useRef<File | null>(null)
    const request = useRef<AbortController | null>(null)
    const [selected, setSelected] = useState<{ name: string; size: number } | null>(null)
    const [phase, setPhase] = useState<'selecting' | 'uploading' | 'uncertain'>('selecting')
    const [error, setError] = useState<string | null>(null)
    const [acknowledged, setAcknowledged] = useState(false)
    const previousPhase = useRef(phase)
    const pending = phase === 'uploading'
    const uncertain = phase === 'uncertain'
    useDocumentTitle(`${uncertain ? copy.uncertainTitle : pending ? copy.pending : copy.title} | Lead Email Finder`)

    function clearSelection() {
        file.current = null
        if (input.current) input.current.value = ''
        setSelected(null)
    }

    useEffect(() => {
        const nativeInput = input.current
        const release = () => {
            file.current = null
            if (nativeInput) nativeInput.value = ''
            request.current?.abort()
            request.current = null
        }
        const leavePage = () => {
            const wasPending = request.current !== null
            release()
            setSelected(null)
            setAcknowledged(false)
            if (wasPending) setPhase('uncertain')
        }
        window.addEventListener('pagehide', leavePage)
        return () => {
            window.removeEventListener('pagehide', leavePage)
            release()
        }
    }, [])
    useEffect(() => {
        if (error) input.current?.focus()
    }, [error])
    useEffect(() => {
        if (phase === 'selecting' && previousPhase.current === 'uncertain') input.current?.focus()
        if (phase === 'uncertain' && previousPhase.current !== 'uncertain') uncertaintyHeading.current?.focus()
        previousPhase.current = phase
    }, [phase])

    function select(next: File | undefined) {
        if (request.current || phase !== 'selecting') return
        setError(null)
        if (!next) return
        if (!/\.csv$/i.test(next.name)) {
            clearSelection()
            setError(copy.extension)
        } else if (next.size > maxCsvBytes) {
            clearSelection()
            setError(copy.oversized)
        } else {
            file.current = next
            setSelected({ name: next.name, size: next.size })
        }
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (request.current || phase !== 'selecting' || !navigator.onLine) return
        if (!file.current) {
            setError(copy.required)
            input.current?.focus()
            return
        }
        const controller = new AbortController()
        request.current = controller
        setPhase('uploading')
        setError(null)
        // Keep only the active fetch, with no automatic retry or retained mutation variables.
        void createBatchVerification(api, file.current, controller.signal).then(
            ({ id }) => {
                if (request.current !== controller) return
                request.current = null
                clearSelection()
                void navigate(`/app/verifications/batches/${id}`)
            },
            (failure: unknown) => {
                if (request.current !== controller) return
                request.current = null
                clearSelection()
                if (failure instanceof ApiError && failure.status === 422) {
                    setPhase('selecting')
                    setError(copy.rejected)
                } else if (failure instanceof ApiError && [401, 403].includes(failure.status)) {
                    setPhase('selecting')
                } else {
                    setAcknowledged(false)
                    setPhase('uncertain')
                }
            },
        )
    }

    return (
        <>
            <header className={styles.header}>
                <h1>{copy.title}</h1>
                <p>{copy.description}</p>
            </header>
            <ProductPanel
                title="CSV batch verification"
                description={copy.cost}
                pending={false}
                refreshing={false}
                failed={false}
                retry={() => undefined}
            >
                <form className={styles.form} noValidate onSubmit={submit} aria-busy={pending}>
                    <div className={form.field}>
                        <label className={form.label} htmlFor="batch-verification-file">
                            {copy.choose}
                        </label>
                        <p id="batch-file-help" className={form.help}>
                            {copy.format}
                        </p>
                        <input
                            ref={input}
                            id="batch-verification-file"
                            className={form.control}
                            type="file"
                            accept=".csv,text/csv"
                            disabled={pending || uncertain}
                            aria-invalid={error !== null}
                            aria-describedby={`batch-file-help${error ? ' batch-file-error' : ''}`}
                            onChange={event => select(event.currentTarget.files?.[0])}
                        />
                        <div className={styles.feedback} aria-live="polite">
                            {selected ? (
                                <p className={form.help}>
                                    {selected.name} — {formatFileSize(selected.size)}
                                </p>
                            ) : null}
                            {error ? (
                                <p id="batch-file-error" className={form.error}>
                                    {error}
                                </p>
                            ) : null}
                        </div>
                        {selected ? (
                            <div className={form.actions}>
                                <button
                                    className={`${action.action} ${action.secondary}`}
                                    type="button"
                                    disabled={pending}
                                    onClick={() => input.current?.click()}
                                >
                                    {copy.replace}
                                </button>
                                <button
                                    className={`${action.action} ${action.secondary}`}
                                    type="button"
                                    disabled={pending}
                                    onClick={() => {
                                        clearSelection()
                                        input.current?.focus()
                                    }}
                                >
                                    {copy.remove}
                                </button>
                            </div>
                        ) : null}
                    </div>
                    <div className={styles.feedback} aria-live="polite">
                        {pending ? (
                            <>
                                <ProgressIndicator label={copy.pending} />
                                <p>{copy.departure}</p>
                            </>
                        ) : null}
                        {!online ? <p>{copy.offline}</p> : null}
                        {uncertain ? (
                            <>
                                <h2 ref={uncertaintyHeading} tabIndex={-1}>
                                    {copy.uncertainTitle}
                                </h2>
                                <p>{copy.uncertain}</p>
                            </>
                        ) : null}
                    </div>
                    {uncertain ? (
                        <>
                            <label className={styles.acknowledgment}>
                                <input
                                    type="checkbox"
                                    checked={acknowledged}
                                    onChange={event => setAcknowledged(event.target.checked)}
                                />
                                {copy.acknowledge}
                            </label>
                            <div className={form.actions}>
                                <button
                                    className={action.action}
                                    type="button"
                                    disabled={!acknowledged}
                                    onClick={() => {
                                        clearSelection()
                                        setAcknowledged(false)
                                        setPhase('selecting')
                                    }}
                                >
                                    {copy.fresh}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className={form.actions}>
                            <button className={action.action} type="submit" disabled={pending || !online}>
                                {copy.submit}
                            </button>
                        </div>
                    )}
                </form>
            </ProductPanel>
        </>
    )
}

export function BatchVerificationPage() {
    const { state } = useAuth()
    if (state.status !== 'authenticated') return null
    if (!state.account.capabilities.includes('verification.run')) return <ForbiddenPage />
    return <BatchForm key={state.account.organization.id} />
}
