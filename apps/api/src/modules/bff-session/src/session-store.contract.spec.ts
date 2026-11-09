import { randomBytes, randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'
import { SessionMissingError, SessionStore } from './application/session-store'
import { BffSessionConfiguration } from './application/bff-session-configuration'
import { SessionRecord } from './domain/session-record'
import { InMemorySessionStore } from './infrastructure/memory/in-memory-session-store'
import { RedisSessionStore } from './infrastructure/redis/redis-session-store'
import { SessionEncryptor } from './infrastructure/crypto/session-encryptor'

const redisUrl = process.env['TEST_BFF_REDIS_URL']
const record = (): SessionRecord => ({
    externalIdentityId: 'identity-contract',
    organizationId: 'organization-contract',
    issuer: 'https://issuer.example.test',
    subject: 'subject-contract',
    csrfToken: 'csrf-contract',
    accessToken: 'access-contract',
    refreshToken: 'refresh-contract',
    accessTokenExpiresAt: Date.now() + 60_000,
    refreshTokenExpiresAt: Date.now() + 120_000,
    absoluteExpiresAt: Date.now() + 180_000,
    createdAt: Date.now(),
})

for (const adapter of ['memory', 'redis'] as const) {
    const suite = adapter === 'redis' && !redisUrl ? describe.skip : describe
    suite(`${adapter} atomic session store contract`, () => {
        let store: SessionStore
        let redis: Redis | undefined
        let encryptor: SessionEncryptor
        const keys = new Set<string>()
        const newKey = (): string => {
            const key = randomUUID()
            keys.add(key)
            return key
        }
        const create = async (): Promise<string> => {
            const id = await store.create(record())
            keys.add(id)
            return id
        }

        beforeAll(() => {
            if (adapter === 'memory') {
                store = new InMemorySessionStore()
            } else {
                redis = new Redis(redisUrl!, { maxRetriesPerRequest: 0, enableOfflineQueue: false, lazyConnect: true })
                encryptor = new SessionEncryptor(randomBytes(32).toString('base64url'))
                store = new RedisSessionStore(redis, encryptor, {
                    sessionIdleTimeoutMs: 120_000,
                } as BffSessionConfiguration)
                return redis.connect()
            }
        })
        afterEach(async () => {
            jest.restoreAllMocks()
            for (const key of keys) await store.delete(key)
            keys.clear()
        })
        afterAll(async () => {
            await redis?.quit()
        })

        it('creates a fresh session and atomically invalidates its old identity on replacement', async () => {
            const old = await create()
            const next = newKey()
            const replacement = { ...record(), externalIdentityId: 'replacement-identity' }
            expect(await store.replace(old, next, replacement)).toBe(true)
            expect(await store.get(old)).toBeUndefined()
            expect(await store.get(next)).toMatchObject(replacement)
        })

        it('does not insert a new session when the expected old key is absent', async () => {
            const next = newKey()
            expect(await store.replace(newKey(), next, record())).toBe(false)
            expect(await store.get(next)).toBeUndefined()
        })

        it('rejects an expired expected old key', async () => {
            const old = await store.create({ ...record(), absoluteExpiresAt: Date.now() + 50 })
            keys.add(old)
            await new Promise(resolve => setTimeout(resolve, 80))
            const next = newKey()
            expect(await store.replace(old, next, record())).toBe(false)
            expect(await store.get(next)).toBeUndefined()
        })

        it('allows exactly one of two competing replacements and leaves no orphan', async () => {
            const old = await create()
            const next = [newKey(), newKey()]
            const results = await Promise.all(next.map(id => store.replace(old, id, record())))
            expect(results.filter(Boolean)).toHaveLength(1)
            expect(await store.get(old)).toBeUndefined()
            for (const [index, id] of next.entries()) {
                expect(Boolean(await store.get(id))).toBe(results[index])
            }
        })

        it('does not resurrect an old session when a previously started request saves afterward', async () => {
            const old = await create()
            const captured = (await store.get(old))!
            expect(await store.replace(old, newKey(), record())).toBe(true)
            await expect(store.save(old, captured)).rejects.toThrow(SessionMissingError)
            expect(await store.get(old)).toBeUndefined()
        })

        it('does not overwrite an occupied replacement key', async () => {
            const old = await create()
            const occupied = await create()
            const before = await store.get(occupied)
            expect(await store.replace(old, occupied, record())).toBe(false)
            expect(await store.get(old)).toBeDefined()
            expect(await store.get(occupied)).toEqual(before)
        })

        if (adapter === 'redis') {
            it('leaves the expected session intact and no new key when the Lua operation errors', async () => {
                const old = await create()
                const next = newKey()
                const evalScript = redis!.eval.bind(redis!)
                jest.spyOn(redis!, 'eval').mockImplementationOnce(() => {
                    return evalScript("return redis.error_reply('injected replacement failure')", 0)
                })
                await expect(store.replace(old, next, record())).rejects.toThrow('injected replacement failure')
                expect(await store.get(old)).toBeDefined()
                expect(await store.get(next)).toBeUndefined()
            })
            it('leaves Redis untouched when serialization fails before the script', async () => {
                const old = await create()
                const next = newKey()
                jest.spyOn(encryptor, 'encrypt').mockRejectedValueOnce(new Error('injected serialization failure'))
                await expect(store.replace(old, next, record())).rejects.toThrow('injected serialization failure')
                expect(await store.get(old)).toBeDefined()
                expect(await store.get(next)).toBeUndefined()
            })
        }
    })
}
