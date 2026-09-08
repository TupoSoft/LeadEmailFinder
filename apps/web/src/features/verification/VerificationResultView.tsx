import { useEffect, useRef } from 'react'
import { SignalDetails } from '../../shared/SignalDetails'
import type { VerificationResult } from './verification-api'
import {
    verificationCopy as copy,
    signalLabel,
    verificationReasonLabels,
    verificationSourceLabels,
} from './verification-copy'
import styles from './VerificationView.module.css'

export function VerificationResultView({ result }: { result: VerificationResult }) {
    const heading = useRef<HTMLHeadingElement>(null)
    const focused = useRef(false)
    useEffect(() => {
        if (focused.current) return
        focused.current = true
        heading.current?.focus()
    }, [])
    const entries = [
        { label: 'Email address', value: result.email },
        { label: 'Local part', value: result.localPart },
        { label: 'Domain', value: result.domain },
        { label: 'Mailbox exists', value: signalLabel(result.exists) },
        { label: 'Catch-all domain', value: signalLabel(result.catchAll) },
        {
            label: 'Reason',
            value: Object.hasOwn(verificationReasonLabels, result.reason)
                ? verificationReasonLabels[result.reason]
                : copy.unknown,
        },
        {
            label: 'Sources',
            value: result.sources.length ? (
                <ul>
                    {result.sources.map((source, index) => (
                        <li key={`${source}:${index}`}>
                            {Object.hasOwn(verificationSourceLabels, source)
                                ? verificationSourceLabels[source]
                                : copy.unknown}
                        </li>
                    ))}
                </ul>
            ) : (
                copy.noSources
            ),
        },
        ...(result.format ? [{ label: 'Address pattern', value: result.format }] : []),
        ...(result.mxDomain ? [{ label: 'Mail exchange domain', value: result.mxDomain }] : []),
        ...(result.targetExchange ? [{ label: 'Target exchange', value: result.targetExchange }] : []),
    ]
    return (
        <section className={styles.result} aria-labelledby="verification-result-heading">
            <h2 id="verification-result-heading" ref={heading} tabIndex={-1}>
                {copy.result}
            </h2>
            <SignalDetails entries={entries} />
            <p className={styles.limits}>{copy.limits}</p>
        </section>
    )
}
