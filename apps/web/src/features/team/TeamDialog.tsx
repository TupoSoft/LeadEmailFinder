import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import styles from './TeamView.module.css'

/** Native modal focus/inert behavior with application-owned content and safe initial focus. */
export function TeamDialog({
    title,
    description,
    onDismiss,
    children,
}: {
    title: string
    description: string
    onDismiss: () => void
    children: ReactNode
}) {
    const dialog = useRef<HTMLDialogElement>(null)
    const titleId = useId()
    const descriptionId = useId()
    useLayoutEffect(() => {
        const element = dialog.current!
        const previous = document.activeElement
        element.showModal()
        element.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
        return () => {
            element.close()
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
        }
    }, [])
    return (
        <dialog
            ref={dialog}
            className={styles.dialog}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onKeyDown={event => {
                if (event.key !== 'Tab') return
                const controls = [
                    ...event.currentTarget.querySelectorAll<HTMLElement>(
                        'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
                    ),
                ].filter(element => element.getClientRects().length > 0)
                const first = controls[0]
                const last = controls[controls.length - 1]
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault()
                    last?.focus()
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault()
                    first?.focus()
                }
            }}
            onCancel={event => {
                event.preventDefault()
                onDismiss()
            }}
        >
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
            {children}
        </dialog>
    )
}
