import { Redis } from 'ioredis'
import { PendingLoginState } from '../../domain/pending-login-state'
import { RedisPendingLoginStateStore } from './redis-pending-login-state-store'

function sampleState(): PendingLoginState {
    return { nonce: 'nonce-1', codeVerifier: 'verifier-1', redirectUri: 'http://localhost:53000/v1/auth/callback', createdAt: Date.now() }
}

describe('RedisPendingLoginStateStore', () => {
    let redis: jest.Mocked<Pick<Redis, 'get' | 'set' | 'del'>>
    let store: RedisPendingLoginStateStore

    beforeEach(() => {
        redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as jest.Mocked<
            Pick<Redis, 'get' | 'set' | 'del'>
        >
        store = new RedisPendingLoginStateStore(redis as unknown as Redis)
    })

    it('stores the pending state with a 10-minute TTL', async () => {
        await store.create('state-1', sampleState())

        expect(redis.set).toHaveBeenCalledWith(expect.stringContaining('state-1'), expect.any(String), 'EX', 600)
    })

    it('returns undefined and does not delete when no state is stored', async () => {
        redis.get.mockResolvedValue(null)

        await expect(store.consume('state-1')).resolves.toBeUndefined()
        expect(redis.del).not.toHaveBeenCalled()
    })

    it('returns and deletes the state on first consumption', async () => {
        const state = sampleState()
        redis.get.mockResolvedValue(JSON.stringify(state))

        const result = await store.consume('state-1')

        expect(result).toEqual(state)
        expect(redis.del).toHaveBeenCalledWith(expect.stringContaining('state-1'))
    })

    it('returns undefined on a second consumption of the same state (anti-replay)', async () => {
        const state = sampleState()
        redis.get.mockResolvedValueOnce(JSON.stringify(state)).mockResolvedValueOnce(null)

        const first = await store.consume('state-1')
        const second = await store.consume('state-1')

        expect(first).toEqual(state)
        expect(second).toBeUndefined()
    })
})
