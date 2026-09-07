import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { returnPolling, useBrowserAvailability, useReturnPolling } from './use-billing'

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('authoritative return polling', () => {
    it('makes a bounded series of reads and stops for terminal purchases', async () => {
        vi.useFakeTimers()
        const refresh = vi.fn().mockResolvedValue(undefined)
        const { result, rerender } = renderHook(({ pending }) => useReturnPolling(pending, refresh, true), {
            initialProps: { pending: true },
        })
        for (let index = 0; index < returnPolling.maxChecks; index += 1) {
            await act(() => vi.advanceTimersByTimeAsync(returnPolling.interval))
        }
        expect(refresh).toHaveBeenCalledTimes(returnPolling.maxChecks)
        expect(result.current).toBe(true)
        await act(() => vi.advanceTimersByTimeAsync(returnPolling.interval * 10))
        expect(refresh).toHaveBeenCalledTimes(returnPolling.maxChecks)
        rerender({ pending: false })
        await act(() => vi.advanceTimersByTimeAsync(returnPolling.interval))
        expect(refresh).toHaveBeenCalledTimes(returnPolling.maxChecks)
    })

    it('pauses hidden and offline pages and resumes only safe reads', async () => {
        vi.useFakeTimers()
        const refresh = vi.fn().mockResolvedValue(undefined)
        const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
        const connectivity = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
        renderHook(() => {
            const { available } = useBrowserAvailability()
            return useReturnPolling(true, refresh, available)
        })
        await act(() => vi.advanceTimersByTimeAsync(returnPolling.interval * 2))
        expect(refresh).not.toHaveBeenCalled()
        visibility.mockReturnValue('visible')
        connectivity.mockReturnValue(false)
        await act(() => document.dispatchEvent(new Event('visibilitychange')))
        await act(() => vi.advanceTimersByTimeAsync(returnPolling.interval * 2))
        expect(refresh).not.toHaveBeenCalled()
        connectivity.mockReturnValue(true)
        await act(() => window.dispatchEvent(new Event('online')))
        await act(() => vi.advanceTimersByTimeAsync(returnPolling.interval))
        expect(refresh).toHaveBeenCalledTimes(1)
    })
})
