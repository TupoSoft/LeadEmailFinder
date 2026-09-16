import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/api-error'
import { useAuth } from '../auth/use-auth'
import { downloadBatchVerification } from './batch-verification-api'
import { batchVerificationCopy as copy } from './batch-verification-copy'
import { verificationCopy } from './verification-copy'
import action from '../../shared/Action.module.css'
import styles from './VerificationView.module.css'

export function BatchResultDownload({ id, online }: { id: string; online: boolean }) {
    const { api } = useAuth()
    const [phase, setPhase] = useState<'idle' | 'pending' | 'downloaded' | 'failed' | 'unavailable'>('idle')
    const request = useRef<AbortController | null>(null)
    const objectUrl = useRef<string | null>(null)
    const heading = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
        // Results arriving after a manual read must not take focus from that control.
        if (document.activeElement === document.body) heading.current?.focus()
        const release = () => {
            request.current?.abort()
            request.current = null
            if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
            objectUrl.current = null
        }
        const leavePage = () => {
            if (request.current) setPhase('failed')
            release()
        }
        window.addEventListener('pagehide', leavePage)
        return () => {
            window.removeEventListener('pagehide', leavePage)
            release()
        }
    }, [])
    useEffect(() => {
        if (phase === 'unavailable') heading.current?.focus()
    }, [phase])

    function download() {
        if (request.current || phase === 'unavailable' || !navigator.onLine) return
        const controller = new AbortController()
        request.current = controller
        setPhase('pending')
        void downloadBatchVerification(api, id, controller.signal).then(
            ({ blob, filename }) => {
                if (request.current !== controller) return
                let link: HTMLAnchorElement | undefined
                try {
                    objectUrl.current = URL.createObjectURL(blob)
                    link = document.createElement('a')
                    link.href = objectUrl.current
                    link.download = filename
                    document.body.append(link)
                    link.click()
                    setPhase('downloaded')
                } catch {
                    setPhase('failed')
                } finally {
                    link?.remove()
                    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
                    objectUrl.current = null
                    request.current = null
                }
            },
            (error: unknown) => {
                if (request.current !== controller) return
                request.current = null
                setPhase(error instanceof ApiError && error.status === 404 ? 'unavailable' : 'failed')
            },
        )
    }

    return (
        <section className={styles.result} aria-labelledby="batch-result-heading">
            <h2 id="batch-result-heading" ref={heading} tabIndex={-1}>
                {phase === 'unavailable' ? copy.resultUnavailableTitle : 'Result CSV'}
            </h2>
            <p className={styles.limits}>{verificationCopy.limits}</p>
            {phase !== 'unavailable' ? (
                <button
                    type="button"
                    className={`${action.action} ${styles.jobActions}`}
                    disabled={phase === 'pending' || !online}
                    aria-busy={phase === 'pending'}
                    onClick={download}
                >
                    {copy.download}
                </button>
            ) : null}
            <div className={`${styles.feedback} ${styles.jobActions}`} aria-live="polite">
                {phase === 'pending' ? <p>{copy.downloading}</p> : null}
                {phase === 'downloaded' ? <p>{copy.downloaded}</p> : null}
                {phase === 'failed' ? <p>{copy.downloadError}</p> : null}
                {phase === 'unavailable' ? <p>{copy.resultUnavailable}</p> : null}
            </div>
        </section>
    )
}
