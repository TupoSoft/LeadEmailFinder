import { publicEntryCopy } from '../content/public-entry'
import { CircuitBackdrop, Icon } from '../shared/icons'
import styles from './SignalPath.module.css'

export function SignalPath() {
    return (
        <section className={styles.signalMap} id="signals" aria-labelledby="signals-heading">
            <h2 className={styles.visuallyHidden} id="signals-heading">
                {publicEntryCopy.signals.heading}
            </h2>
            <CircuitBackdrop className={styles.circuit} />
            <div className={styles.sequence}>
                <div className={styles.origin} aria-hidden="true">
                    @
                </div>
                <ol className={styles.stages}>
                    {publicEntryCopy.signals.items.map(item => (
                        <li className={styles.stage} key={item.name}>
                            <span className={styles.iconWrap} aria-hidden="true">
                                <Icon className={styles.icon} name={item.icon} />
                            </span>
                            <span className={styles.stageCopy}>
                                <strong>{item.name}</strong>
                                <span>{item.description}</span>
                            </span>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    )
}
