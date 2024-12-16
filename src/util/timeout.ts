import { clearTimeout } from 'node:timers'

export async function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, error: Error): Promise<T> {
    const timeoutPromise = new Promise<never>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(error)
        }, timeoutMs)

        promise
            .catch((reason: unknown) => {
                if (reason instanceof Error) {
                    reject(reason)
                }
            })
            .finally(() => {
                clearTimeout(timeoutId)
            })
    })

    return await Promise.race([promise, timeoutPromise])
}
