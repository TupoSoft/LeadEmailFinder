import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CurrentAccount } from '../api/current-account'
import { SkipLink } from '../components/SkipLink'
import { authCopy } from '../content/auth-shell'
import { ResponsiveNavigation } from '../shared/ResponsiveNavigation'
import action from '../shared/Action.module.css'
import { visibleDestinations } from './navigation'
import styles from './ApplicationFrame.module.css'

export function ApplicationFrame({
    account,
    onSignOut,
    children,
}: {
    account?: CurrentAccount
    onSignOut?: () => void
    children: ReactNode
}) {
    return (
        <div className={styles.frame}>
            <SkipLink />
            <header className={styles.header}>
                <Link to="/app" className={styles.brand} aria-label={authCopy.brandHome}>
                    {authCopy.brand}
                </Link>
                {account ? (
                    <button type="button" className={`${action.action} ${action.secondary}`} onClick={onSignOut}>
                        {authCopy.signOut}
                    </button>
                ) : (
                    <Link className={`${action.action} ${action.secondary}`} aria-label={authCopy.publicHome} to="/">
                        {authCopy.about}
                    </Link>
                )}
            </header>
            <div className={styles.layout}>
                <aside className={styles.sidebar}>
                    <p className={styles.contextLabel}>{authCopy.workspace}</p>
                    <ResponsiveNavigation destinations={visibleDestinations(account?.capabilities ?? [])} />
                    {account ? (
                        <div className={styles.account}>
                            <p className={styles.contextLabel}>{authCopy.account}</p>
                            <p>{account.email ?? authCopy.emailUnavailable}</p>
                            <p className={styles.contextLabel}>{authCopy.organization}</p>
                            <p>{account.organization.name}</p>
                        </div>
                    ) : null}
                </aside>
                <main id="main-content" tabIndex={-1} className={styles.main}>
                    {children}
                </main>
            </div>
            <footer className={styles.footer}>
                <Link to="/">
                    {authCopy.publicHome}
                    <span aria-hidden="true"> ↗</span>
                </Link>
            </footer>
        </div>
    )
}
