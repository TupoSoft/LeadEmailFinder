import { useSyncExternalStore } from 'react'

function subscribe(listener: () => void) {
    window.addEventListener('online', listener)
    window.addEventListener('offline', listener)
    document.addEventListener('visibilitychange', listener)
    return () => {
        window.removeEventListener('online', listener)
        window.removeEventListener('offline', listener)
        document.removeEventListener('visibilitychange', listener)
    }
}

export function useBrowserAvailability() {
    const available = useSyncExternalStore(
        subscribe,
        () => navigator.onLine && document.visibilityState !== 'hidden',
        () => true,
    )
    const online = useSyncExternalStore(
        subscribe,
        () => navigator.onLine,
        () => true,
    )
    return { available, online }
}
