import { useEffect, useRef, useState } from 'react'
import { useBrowserAvailability } from '../../shared/use-browser-availability'

export const verificationPolling = { interval: 5000, maxChecks: 60 } as const

/** Both verification routes use the same bounded, read-only polling lifecycle. */
export function useVerificationPolling({
    active,
    isFetching,
    isError,
    refetch,
}: {
    active: boolean
    isFetching: boolean
    isError: boolean
    refetch: () => Promise<unknown>
}) {
    const { available, online } = useBrowserAvailability()
    const [checks, setChecks] = useState(0)
    const started = useRef(false)
    useEffect(() => {
        if (!available || started.current) return
        started.current = true
        void refetch()
    }, [available, refetch])
    useEffect(() => {
        if (!available || !active || isFetching || isError || checks >= verificationPolling.maxChecks) return
        const timer = window.setTimeout(() => {
            if (!navigator.onLine || document.visibilityState === 'hidden') return
            setChecks(value => value + 1)
            void refetch()
        }, verificationPolling.interval)
        return () => window.clearTimeout(timer)
    }, [active, available, checks, isError, isFetching, refetch])
    return {
        available,
        online,
        pollingStopped: checks >= verificationPolling.maxChecks,
        refresh: () => {
            if (!navigator.onLine || isFetching) return
            setChecks(0)
            void refetch()
        },
    }
}
