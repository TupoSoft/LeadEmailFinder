import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../app/useDocumentTitle'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { SkipLink } from '../components/SkipLink'
import { notFoundCopy } from '../content/public-entry'
import { CircuitBackdrop } from '../shared/icons'
import styles from './NotFoundPage.module.css'

export function NotFoundPage() {
    useDocumentTitle(notFoundCopy.documentTitle)

    return (
        <div className={styles.page}>
            <SkipLink />
            <SiteHeader />
            <main className={styles.main} id="main-content" tabIndex={-1}>
                <section className={styles.message} aria-labelledby="not-found-heading">
                    <span className={styles.code} aria-hidden="true">
                        404
                    </span>
                    <h1 id="not-found-heading">{notFoundCopy.title}</h1>
                    <p>{notFoundCopy.description}</p>
                    <p className={styles.guidance}>{notFoundCopy.guidance}</p>
                    <Link className={styles.homeLink} to="/">
                        {notFoundCopy.homeLink}
                        <span aria-hidden="true">→</span>
                    </Link>
                </section>
                <div className={styles.diagram} aria-hidden="true">
                    <CircuitBackdrop className={styles.circuit} />
                    <span className={styles.brokenSignal} />
                </div>
            </main>
            <SiteFooter />
        </div>
    )
}
