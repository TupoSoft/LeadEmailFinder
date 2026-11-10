import { Redis } from 'ioredis'
import { PendingLoginState } from '../../domain/pending-login-state'
import { RedisPendingLoginStateStore } from './redis-pending-login-state-store'

function sampleState(): PendingLoginState {
    return {
        nonce: 'nonce-1',
        codeVerifier: 'verifier-1',
        redirectUri: 'http://localhost:53000/v1/auth/callback',
        destination: '/app',
        sessionLineage: { kind: 'fresh' },
        createdAt: Date.now(),
    }
}

describe('RedisPendingLoginStateStore', () => {
    let redis: jest.Mocked<Pick<Redis, 'getdel' | 'set'>>
    let store: RedisPendingLoginStateStore

    beforeEach(() => {
        redis = { getdel: jest.fn(), set: jest.fn() }
        store = new RedisPendingLoginStateStore(redis as unknown as Redis)
    })

    it('stores the pending state with a 10-minute TTL', async () => {
        await store.create('state-1', sampleState())

        expect(redis.set).toHaveBeenCalledWith(expect.stringContaining('state-1'), expect.any(String), 'EX', 600)
    })

    it('returns undefined when no state is stored', async () => {
        redis.getdel.mockResolvedValue(null)

        await expect(store.consume('state-1')).resolves.toBeUndefined()
        expect(redis.getdel).toHaveBeenCalledWith('bff-login-state:state-1')
    })

    it('atomically returns and deletes the state on first consumption', async () => {
        const state = sampleState()
        redis.getdel.mockResolvedValue(JSON.stringify(state))

        const result = await store.consume('state-1')

        expect(result).toEqual(state)
        expect(redis.getdel).toHaveBeenCalledWith('bff-login-state:state-1')
    })

    it('returns undefined on a second consumption of the same state (anti-replay)', async () => {
        const state = sampleState()
        redis.getdel.mockResolvedValueOnce(JSON.stringify(state)).mockResolvedValueOnce(null)

        const first = await store.consume('state-1')
        const second = await store.consume('state-1')

        expect(first).toEqual(state)
        expect(second).toBeUndefined()
        expect(redis.getdel).toHaveBeenNthCalledWith(1, 'bff-login-state:state-1')
        expect(redis.getdel).toHaveBeenNthCalledWith(2, 'bff-login-state:state-1')
    })
})
