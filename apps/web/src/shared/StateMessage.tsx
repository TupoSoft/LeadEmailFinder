import type { ReactNode } from 'react'
import { useDocumentTitle } from '../app/useDocumentTitle'
import { authCopy } from '../content/auth-shell'
import styles from './StateMessage.module.css'

export function StateMessage({
    title,
    description,
    pending = false,
    children,
}: {
    title: string
    description: string
    pending?: boolean
    children?: ReactNode
}) {
    useDocumentTitle(`${title} | ${authCopy.brand}`)
    return (
        <section className={styles.message} aria-labelledby="state-heading" aria-busy={pending}>
            <p className={styles.eyebrow}>{authCopy.workspace}</p>
            <h1 id="state-heading">{title}</h1>
            <p role={pending ? 'status' : undefined}>{description}</p>
            <div className={styles.actions}>{children}</div>
        </section>
    )
}
