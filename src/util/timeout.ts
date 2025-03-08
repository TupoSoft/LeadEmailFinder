import { setTimeout } from 'node:timers/promises'

export async function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, error: Error): Promise<T> {
    return await Promise.race([promise, setTimeout(timeoutMs).then(async () => await Promise.reject(error))])
}
