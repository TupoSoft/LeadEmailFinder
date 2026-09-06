import { publicEntryCopy } from '../content/public-entry'
import { BrandGlyph } from '../shared/icons'
import styles from './SiteFooter.module.css'

export function SiteFooter() {
    return (
        <footer className={styles.footer}>
            <div className={styles.brand}>
                <BrandGlyph className={styles.glyph} />
                <strong>{publicEntryCopy.brand}</strong>
            </div>
            <p>{publicEntryCopy.footer}</p>
        </footer>
    )
}
