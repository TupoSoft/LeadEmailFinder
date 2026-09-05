import { publicEntryCopy } from '../content/public-entry'
import styles from './SkipLink.module.css'

export function SkipLink() {
    return (
        <a className={styles.skipLink} href="#main-content">
            {publicEntryCopy.accessibility.skipToMain}
        </a>
    )
}
