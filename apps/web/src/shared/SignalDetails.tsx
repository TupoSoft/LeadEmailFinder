import type { ReactNode } from 'react'
import styles from './SignalDetails.module.css'

/** Evidence stays textual and in reading order; a completed check is not a delivery verdict. */
export function SignalDetails({
    entries,
    variant,
}: {
    entries: readonly { label: string; value: ReactNode }[]
    variant?: 'balance'
}) {
    return (
        <dl className={`${styles.details}${variant === 'balance' ? ` ${styles.balance}` : ''}`}>
            {entries.map(({ label, value }) => (
                <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    )
}
