import { Link, useLocation } from 'react-router-dom'
import { publicEntryCopy } from '../content/public-entry'
import { authCopy } from '../content/auth-shell'
import styles from './SiteHeader.module.css'

export function SiteHeader() {
    const { pathname } = useLocation()
    const destinationPrefix = pathname === '/' ? '' : '/'

    return (
        <header className={styles.header}>
            <Link className={styles.brand} to="/" aria-label={publicEntryCopy.accessibility.brandHomeLabel}>
                {publicEntryCopy.brand}
            </Link>
            <nav aria-label={publicEntryCopy.navigationLabel}>
                <ul className={styles.navigation}>
                    {publicEntryCopy.navigation.map(item => (
                        <li key={item.target}>
                            <a href={`${destinationPrefix}#${item.target}`}>{item.label}</a>
                        </li>
                    ))}
                    <li>
                        <Link to="/app">{authCopy.workspace}</Link>
                    </li>
                </ul>
            </nav>
        </header>
    )
}
