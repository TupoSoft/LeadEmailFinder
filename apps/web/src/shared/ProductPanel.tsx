import { useId, type ReactNode } from 'react'
import { productCopy } from '../content/product'
import action from './Action.module.css'
import styles from './ProductPanel.module.css'

export function ProductPanel({
    title,
    description,
    pending,
    refreshing,
    failed,
    retry,
    children,
    reserveContent = false,
    feedback,
}: {
    title: string
    description: string
    pending: boolean
    refreshing: boolean
    failed: boolean
    retry: () => void
    children: ReactNode
    reserveContent?: boolean
    feedback?: ReactNode
}) {
    const heading = useId()
    return (
        <section className={styles.panel} aria-labelledby={heading} aria-busy={refreshing}>
            <h2 id={heading}>{title}</h2>
            <p>{description}</p>
            <div className={styles.feedback} aria-live="polite">
                {failed ? (
                    <>
                        <p>{productCopy.readError}</p>
                        <button type="button" className={`${action.action} ${action.secondary}`} onClick={retry}>
                            {productCopy.retry}
                        </button>
                    </>
                ) : null}
                {pending ? <p>{productCopy.loading}</p> : refreshing ? <p>{productCopy.refreshing}</p> : null}
                {feedback}
            </div>
            <div className={`${styles.content} ${reserveContent ? styles.reserved : ''}`}>{children}</div>
        </section>
    )
}
