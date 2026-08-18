export class RedisUnavailableError extends Error {
    constructor(operation: string) {
        super(`Redis did not respond to "${operation}" within the allotted timeout`)
        this.name = 'RedisUnavailableError'
    }
}

export const DEFAULT_REDIS_TIMEOUT_MS = 2000

export async function withRedisTimeout<T>(
    operation: string,
    promise: Promise<T>,
    timeoutMs: number = DEFAULT_REDIS_TIMEOUT_MS,
): Promise<T> {
    let timer: NodeJS.Timeout

    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new RedisUnavailableError(operation)), timeoutMs)
    })

    try {
        return await Promise.race([promise, timeout])
    } finally {
        clearTimeout(timer!)
    }
}
