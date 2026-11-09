import { RedisUnavailableError, withRedisTimeout } from './redis-timeout'

describe('withRedisTimeout', () => {
    it('resolves with the underlying value when it settles before the timeout', async () => {
        await expect(withRedisTimeout('get', Promise.resolve('value'), 50)).resolves.toBe('value')
    })

    it('rejects with RedisUnavailableError when the operation hangs past the timeout', async () => {
        const hangingPromise = new Promise<string>(() => {
            // never resolves, simulating an unreachable Redis
        })

        await expect(withRedisTimeout('get', hangingPromise, 10)).rejects.toThrow(RedisUnavailableError)
    })

    it('propagates a rejection from the underlying promise unchanged', async () => {
        await expect(withRedisTimeout('get', Promise.reject(new Error('connection refused')), 50)).rejects.toThrow(
            'connection refused',
        )
    })
})
