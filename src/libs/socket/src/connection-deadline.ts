import type { Socket } from 'node:net'
import { ConnectionTimeoutError } from './connection-timeout.error'

export interface ConnectionDeadline {
    /** Effective signal to feed into ConnectOptions.signal / write() / readBytes() / readUntil(). */
    readonly signal: AbortSignal | undefined
    /**
     * Strategies call this as soon as they have a live socket (the raw TCP socket, and again after a TLS
     * upgrade) so the deadline knows which socket to destroy if it fires. Safe to call more than once.
     */
    track: (socket: Socket) => void
    /**
     * Call from the outer catch: if this deadline's own timer is what fired, returns the
     * ConnectionTimeoutError instance (regardless of the raw caught error); otherwise returns the
     * original error untouched, so a caller-initiated abort stays distinguishable from deadline expiry.
     */
    normalizeError: (error: unknown) => unknown
    /** Clears the timer and detaches the abort listener. Call in a `finally`. */
    clear: () => void
}

export interface CreateConnectionDeadlineOptions {
    host: string
    port: number
    timeout?: number
    signal?: AbortSignal
}

export function createConnectionDeadline({
    host,
    port,
    timeout,
    signal: callerSignal,
}: CreateConnectionDeadlineOptions): ConnectionDeadline {
    const hasDeadline = typeof timeout === 'number' && timeout > 0
    const deadlineController = hasDeadline ? new AbortController() : undefined
    let timer: NodeJS.Timeout | undefined

    if (deadlineController !== undefined && timeout !== undefined) {
        const timeoutError = new ConnectionTimeoutError({ host, port, timeoutMs: timeout })
        timer = setTimeout(() => deadlineController.abort(timeoutError), timeout)
        timer.unref()
    }

    const effectiveSignal =
        deadlineController === undefined
            ? callerSignal
            : callerSignal === undefined
              ? deadlineController.signal
              : AbortSignal.any([callerSignal, deadlineController.signal])

    let activeSocket: Socket | undefined

    const onAbort = (): void => {
        if (activeSocket !== undefined && !activeSocket.destroyed) {
            const reason: unknown = effectiveSignal?.reason
            activeSocket.destroy(reason instanceof Error ? reason : new Error(String(reason)))
        }
    }

    effectiveSignal?.addEventListener('abort', onAbort, { once: true })

    return {
        signal: effectiveSignal,
        track(socket) {
            activeSocket = socket
            if (effectiveSignal?.aborted === true) {
                onAbort()
            }
        },
        normalizeError(error) {
            return deadlineController?.signal.aborted === true
                ? (deadlineController.signal.reason as unknown)
                : error
        },
        clear() {
            if (timer !== undefined) {
                clearTimeout(timer)
            }
            effectiveSignal?.removeEventListener('abort', onAbort)
        },
    }
}
