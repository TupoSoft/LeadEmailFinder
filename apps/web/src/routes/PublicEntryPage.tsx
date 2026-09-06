import { Principles } from '../components/Principles'
import { SignalPath } from '../components/SignalPath'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { SkipLink } from '../components/SkipLink'
import { publicEntryCopy } from '../content/public-entry'
import { useDocumentTitle } from '../app/useDocumentTitle'
import styles from './PublicEntryPage.module.css'

export function PublicEntryPage() {
    useDocumentTitle(publicEntryCopy.documentTitle)

    return (
        <div className={styles.page}>
            <SkipLink />
            <SiteHeader />
            <main id="main-content" tabIndex={-1}>
                <section className={styles.hero} id="how-it-works" aria-labelledby="public-entry-heading">
                    <div className={styles.story}>
                        <h1 id="public-entry-heading" aria-label={publicEntryCopy.hero.title}>
                            {publicEntryCopy.hero.titleLines.map(line => (
                                <span key={line}>{line}</span>
                            ))}
                        </h1>
                        <p className={styles.introduction}>{publicEntryCopy.hero.introduction}</p>
                        <div className={styles.callout}>
                            <span aria-hidden="true" />
                            <h2>{publicEntryCopy.hero.callout}</h2>
                            <p>{publicEntryCopy.hero.calloutBody}</p>
                        </div>
                    </div>
                    <SignalPath />
                    <a className={styles.pathLink} href="#principles">
                        {publicEntryCopy.hero.continueLink}
                        <span aria-hidden="true">↓</span>
                    </a>
                </section>
                <Principles />
            </main>
            <SiteFooter />
        </div>
    )
}
