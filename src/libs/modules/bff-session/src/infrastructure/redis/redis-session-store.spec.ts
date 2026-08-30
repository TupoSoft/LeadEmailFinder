import { Redis } from 'ioredis'
import { SessionRecord } from '../../domain/session-record'
import { BffSessionConfiguration } from '../../application/bff-session-configuration'
import { SessionEncryptor } from '../crypto/session-encryptor'
import { RedisSessionStore } from './redis-session-store'
import { RedisUnavailableError } from './redis-timeout'

function sampleRecord(overrides: Partial<SessionRecord> = {}): SessionRecord {
    return {
        externalIdentityId: 'identity-1',
        organizationId: 'org-1',
        issuer: 'https://issuer',
        subject: 'subject-1',
        csrfToken: 'csrf-token',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshTokenExpiresAt: Date.now() + 120_000,
        absoluteExpiresAt: Date.now() + 86_400_000,
        createdAt: Date.now(),
        ...overrides,
    }
}

describe('RedisSessionStore', () => {
    let redis: jest.Mocked<Pick<Redis, 'get' | 'set' | 'del'>>
    let encryptor: jest.Mocked<SessionEncryptor>
    let configuration: BffSessionConfiguration
    let store: RedisSessionStore

    beforeEach(() => {
        redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as jest.Mocked<
            Pick<Redis, 'get' | 'set' | 'del'>
        >
        encryptor = { encrypt: jest.fn(), decrypt: jest.fn() } as unknown as jest.Mocked<SessionEncryptor>
        configuration = {
            appBaseUrl: 'http://localhost:53000',
            issuer: 'https://issuer',
            clientId: 'client',
            clientSecret: 'secret',
            sessionIdleTimeoutMs: 8 * 60 * 60 * 1000,
            sessionAbsoluteTimeoutMs: 24 * 60 * 60 * 1000,
            isSecureCookie: false,
        }
        store = new RedisSessionStore(redis as unknown as Redis, encryptor, configuration)
    })

    describe('save', () => {
        it('sets a TTL bounded by the idle timeout when the absolute deadline is further away', async () => {
            encryptor.encrypt.mockResolvedValue('ciphertext')
            const record = sampleRecord({ absoluteExpiresAt: Date.now() + 100 * 60 * 60 * 1000 })

            await store.save('session-1', record)

            const [, , ex, ttl] = redis.set.mock.calls[0]
            expect(ex).toBe('EX')
            expect(ttl).toBeLessThanOrEqual(Math.ceil(configuration.sessionIdleTimeoutMs / 1000))
        })

        it('sets a TTL bounded by the remaining absolute lifetime when it is shorter than the idle timeout', async () => {
            encryptor.encrypt.mockResolvedValue('ciphertext')
            const record = sampleRecord({ absoluteExpiresAt: Date.now() + 5000 })

            await store.save('session-1', record)

            const [, , , ttl] = redis.set.mock.calls[0]
            expect(ttl).toBeLessThanOrEqual(5)
        })
    })

    describe('get', () => {
        it('returns undefined when no record is stored', async () => {
            redis.get.mockResolvedValue(null)

            await expect(store.get('session-1')).resolves.toBeUndefined()
        })

        it('returns undefined when decryption fails', async () => {
            redis.get.mockResolvedValue('ciphertext')
            encryptor.decrypt.mockResolvedValue(undefined)

            await expect(store.get('session-1')).resolves.toBeUndefined()
        })

        it('returns undefined when the decrypted record is past its absolute expiry', async () => {
            redis.get.mockResolvedValue('ciphertext')
            encryptor.decrypt.mockResolvedValue(sampleRecord({ absoluteExpiresAt: Date.now() - 1000 }))

            await expect(store.get('session-1')).resolves.toBeUndefined()
        })

        it('returns the record when it decrypts successfully and has not expired', async () => {
            const record = sampleRecord()
            redis.get.mockResolvedValue('ciphertext')
            encryptor.decrypt.mockResolvedValue(record)

            await expect(store.get('session-1')).resolves.toEqual(record)
        })

        it('treats a hung Redis connection as no session', async () => {
            redis.get.mockReturnValue(new Promise(() => {}) as never)

            await expect(store.get('session-1')).rejects.toThrow(RedisUnavailableError)
        })
    })

    describe('create', () => {
        it('mints a fresh session id and persists the record under it', async () => {
            encryptor.encrypt.mockResolvedValue('ciphertext')

            const sessionId = await store.create(sampleRecord())

            expect(typeof sessionId).toBe('string')
            expect(sessionId.length).toBeGreaterThan(16)
            expect(redis.set).toHaveBeenCalledWith(expect.stringContaining(sessionId), 'ciphertext', 'EX', expect.any(Number))
        })
    })

    describe('delete', () => {
        it('deletes the session key', async () => {
            await store.delete('session-1')

            expect(redis.del).toHaveBeenCalledWith(expect.stringContaining('session-1'))
        })
    })
})
