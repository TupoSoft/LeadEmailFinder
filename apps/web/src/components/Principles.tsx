import { publicEntryCopy } from '../content/public-entry'
import { Icon } from '../shared/icons'
import styles from './Principles.module.css'

export function Principles() {
    return (
        <section className={styles.section} id="principles" aria-labelledby="principles-heading">
            <div className={styles.introduction}>
                <h2 id="principles-heading">{publicEntryCopy.principles.heading}</h2>
                <span className={styles.accentRule} aria-hidden="true" />
                <p>{publicEntryCopy.principles.introduction}</p>
            </div>
            <ul className={styles.list}>
                {publicEntryCopy.principles.items.map(item => (
                    <li className={styles.item} key={item.name}>
                        <Icon className={styles.icon} name={item.icon} />
                        <div>
                            <h3>{item.name}</h3>
                            <p>{item.description}</p>
                        </div>
                    </li>
                ))}
            </ul>
            <a className={styles.readLink} href="#how-it-works">
                {publicEntryCopy.principles.returnLink}
                <span aria-hidden="true">↑</span>
            </a>
        </section>
    )
}
