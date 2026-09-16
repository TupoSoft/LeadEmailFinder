import type { AriaAttributes, ComponentPropsWithoutRef } from 'react'
import styles from './SupportingText.module.css'

type SupportingTextProps = Pick<
    ComponentPropsWithoutRef<'p'>,
    keyof AriaAttributes | 'children' | 'id' | 'role' | 'hidden' | 'lang' | 'dir' | 'title'
>

export function SupportingText({ children, ...attributes }: SupportingTextProps) {
    return (
        <p {...attributes} className={styles.text}>
            {children}
        </p>
    )
}
