import { useEffect, useState } from 'react'

/** Enables a deliberate retry at the server's deadline; never performs the retry. */
export function useRetryTime(retryAt: number | undefined): boolean {
    const [checkedAt, setCheckedAt] = useState(() => Date.now())
    useEffect(() => {
        if (retryAt === undefined || retryAt <= Date.now()) return
        const timer = window.setTimeout(
            () => setCheckedAt(Date.now()),
            Math.min(retryAt - Date.now() + 1, 2_147_483_647),
        )
        return () => window.clearTimeout(timer)
    }, [retryAt, checkedAt])
    return retryAt !== undefined && retryAt > Date.now()
}
