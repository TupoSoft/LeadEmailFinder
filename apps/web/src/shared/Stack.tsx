import type { AriaAttributes, ComponentPropsWithoutRef } from 'react'
import styles from './Stack.module.css'

type StackProps = Pick<
    ComponentPropsWithoutRef<'div'>,
    keyof AriaAttributes | 'children' | 'id' | 'role' | 'hidden' | 'lang' | 'dir' | 'title'
> & {
    gap?: 'content' | 'control'
}

/** The parent owns spacing between direct children; nest stacks to group related content. */
export function Stack({ gap = 'content', children, ...attributes }: StackProps) {
    return (
        <div {...attributes} className={`${styles.stack} ${styles[gap]}`}>
            {children}
        </div>
    )
}
