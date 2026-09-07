import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { ApplicationDestination } from '../app/navigation'
import { authCopy } from '../content/auth-shell'
import styles from './ResponsiveNavigation.module.css'

export function ResponsiveNavigation({ destinations }: { destinations: readonly ApplicationDestination[] }) {
    const location = useLocation()
    const [openedAt, setOpenedAt] = useState<string | null>(null)
    const trigger = useRef<HTMLButtonElement>(null)
    const navigation = useRef<HTMLElement>(null)
    const open = openedAt === location.key
    const wasOpen = useRef(false)

    useLayoutEffect(() => {
        if (open) navigation.current?.querySelector('a')?.focus()
        else if (wasOpen.current) trigger.current?.focus()
        wasOpen.current = open
    }, [open])

    useLayoutEffect(() => {
        if (openedAt !== null && openedAt !== location.key) setOpenedAt(null)
    }, [location.key, openedAt])

    function close() {
        setOpenedAt(null)
    }

    return (
        <div
            className={styles.container}
            onKeyDown={event => {
                if (event.key === 'Escape' && open) {
                    event.preventDefault()
                    close()
                }
            }}
        >
            <button
                ref={trigger}
                type="button"
                className={styles.trigger}
                aria-expanded={open}
                aria-controls="application-navigation"
                onClick={() => setOpenedAt(open ? null : location.key)}
            >
                {open ? authCopy.closeNavigation : authCopy.openNavigation}
                <span aria-hidden="true">{open ? '−' : '+'}</span>
            </button>
            <nav
                id="application-navigation"
                ref={navigation}
                aria-label={authCopy.navigation}
                className={styles.navigation}
                data-open={open}
            >
                <ul>
                    {destinations.map(item => (
                        <li key={item.path}>
                            <NavLink to={item.path} end={item.path === '/app'} onClick={close}>
                                {item.label}
                                <span aria-hidden="true">↗</span>
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </nav>
        </div>
    )
}
