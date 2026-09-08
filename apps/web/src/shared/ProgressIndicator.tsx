import styles from './ProgressIndicator.module.css'

/** Omit value when progress cannot be measured; never invent upload percentages. */
export function ProgressIndicator({ label, value }: { label: string; value?: number }) {
    return (
        <div className={styles.indicator}>
            <p>
                {label}
                {value === undefined ? '' : `: ${value}%`}
            </p>
            <div
                className={styles.track}
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value}
            >
                {value === undefined ? null : <span className={styles.fill} style={{ width: `${value}%` }} />}
            </div>
        </div>
    )
}
