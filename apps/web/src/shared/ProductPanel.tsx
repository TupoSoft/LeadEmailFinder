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
    headerAction,
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
    headerAction?: ReactNode
}) {
    const heading = useId()
    const headingContent = (
        <>
            <h2 id={heading}>{title}</h2>
            <p>{description}</p>
        </>
    )
    return (
        <section className={styles.panel} aria-labelledby={heading} aria-busy={refreshing}>
            {headerAction ? (
                <header className={styles.headerWithAction}>
                    {headingContent}
                    <div className={styles.headerAction}>{headerAction}</div>
                </header>
            ) : (
                headingContent
            )}
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
