import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import type { RedisOptions, SentinelAddress } from 'ioredis'
import { ParseConnectionStringOptionsFactory } from './parse-connection-string-options.factory'
import { REDIS_DEFAULT_DB_INDEX, REDIS_DEFAULT_PORT, REDIS_SENTINEL_DEFAULT_PORT } from './redis.constants'

interface FactoryConfiguration {
    NODE_ENV: 'development' | 'production'
    REDIS_TLS_CA?: string
    REDIS_URL?: string
}

describe('ParseConnectionStringOptionsFactory', () => {
    let factory: ParseConnectionStringOptionsFactory
    let configService: Partial<ConfigService>

    const createFactory = async (
        redisUrl?: string,
        overrides: Partial<FactoryConfiguration> = {},
    ): Promise<ParseConnectionStringOptionsFactory> => {
        const configuration: FactoryConfiguration = {
            NODE_ENV: 'development',
            REDIS_URL: redisUrl,
            ...overrides,
        }
        configService = {
            get: jest.fn((key: keyof FactoryConfiguration) => configuration[key]),
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [ParseConnectionStringOptionsFactory, { provide: ConfigService, useValue: configService }],
        }).compile()

        return module.get<ParseConnectionStringOptionsFactory>(ParseConnectionStringOptionsFactory)
    }

    describe('constructor', () => {
        it('should throw a stable error if REDIS_URL is undefined', async () => {
            await expect(createFactory(undefined)).rejects.toThrow('REDIS_URL: missing')
        })

        it('should set redisUrl if defined', async () => {
            factory = await createFactory('redis://localhost')
            expect(factory).toBeDefined()
        })
    })

    describe('parseRedisStandaloneUrl', () => {
        it('should parse a plaintext development URL', async () => {
            factory = await createFactory('redis://user:pass@myhost:6380/5')

            expect(factory.create()).toEqual<RedisOptions>({
                host: 'myhost',
                port: 6380,
                db: 5,
                username: 'user',
                password: 'pass',
                maxRetriesPerRequest: null,
            })
        })

        it('should default missing values in development', async () => {
            factory = await createFactory('redis://myhost')

            expect(factory.create()).toEqual<RedisOptions>({
                host: 'myhost',
                port: REDIS_DEFAULT_PORT,
                db: REDIS_DEFAULT_DB_INDEX,
                username: undefined,
                password: undefined,
                maxRetriesPerRequest: null,
            })
        })

        it('should reject plaintext transport in production without exposing the URL', async () => {
            const password = 'standalone-secret'
            const redisUrl = `redis://user:${password}@private-redis:6380/5`
            factory = await createFactory(redisUrl, { NODE_ENV: 'production' })

            expect(() => factory.create()).toThrow('REDIS_URL: insecure-transport')

            try {
                factory.create()
            } catch (error) {
                expect(String(error)).not.toContain(redisUrl)
                expect(String(error)).not.toContain(password)
                expect(String(error)).not.toContain('private-redis')
            }
        })

        it('should configure peer-verified TLS for a production rediss URL', async () => {
            factory = await createFactory('rediss://user:pass@myhost:6380/5', { NODE_ENV: 'production' })

            expect(factory.create()).toEqual<RedisOptions>({
                host: 'myhost',
                port: 6380,
                db: 5,
                username: 'user',
                password: 'pass',
                maxRetriesPerRequest: null,
                tls: {
                    rejectUnauthorized: true,
                },
            })
        })

        it('should pass optional trusted CA contents to production standalone TLS', async () => {
            const trustedCa = 'trusted-ca-contents'
            factory = await createFactory('rediss://myhost', {
                NODE_ENV: 'production',
                REDIS_TLS_CA: trustedCa,
            })

            expect(factory.create().tls).toEqual({
                rejectUnauthorized: true,
                ca: trustedCa,
            })
        })

        it('should support a peer-verified TLS URL in development', async () => {
            factory = await createFactory('rediss://myhost')

            expect(factory.create().tls).toEqual({
                rejectUnauthorized: true,
            })
        })

        it('should throw a stable error on an invalid database index', async () => {
            factory = await createFactory('redis://user:database-secret@myhost/not-a-number')

            expect(() => factory.create()).toThrow('REDIS_URL: invalid-database-index')
            expect(() => factory.create()).not.toThrow('database-secret')
        })

        it('should redact URL parser failures', async () => {
            const password = 'parser-secret'
            const redisUrl = `rediss://user:${password}@[broken-host`
            factory = await createFactory(redisUrl, { NODE_ENV: 'production' })

            expect(() => factory.create()).toThrow('REDIS_URL: invalid-url')

            try {
                factory.create()
            } catch (error) {
                expect(String(error)).not.toContain(redisUrl)
                expect(String(error)).not.toContain(password)
            }
        })
    })

    describe('parseRedisSentinelUrl', () => {
        const sentinelHosts = ['host1:26379', 'host2']
        const masterName = 'mymaster'
        const dbIndex = '2'
        const username = 'user'
        const password = 'pass'
        const hostsStr = sentinelHosts.join(',')
        const url = `redis-sentinel://${username}:${password}@${hostsStr}/${dbIndex}?name=${masterName}`

        it('should preserve plaintext Sentinel behavior in development', async () => {
            factory = await createFactory(url)
            const expectedSentinels: SentinelAddress[] = [
                { host: 'host1', port: 26379 },
                { host: 'host2', port: REDIS_SENTINEL_DEFAULT_PORT },
            ]

            expect(factory.create()).toEqual<RedisOptions>({
                name: masterName,
                sentinels: expectedSentinels,
                username,
                password,
                sentinelPassword: password,
                db: parseInt(dbIndex, 10),
                maxRetriesPerRequest: null,
            })
        })

        it('should use peer-verified TLS for Sentinel discovery and the selected master in production', async () => {
            factory = await createFactory(url, { NODE_ENV: 'production' })

            expect(factory.create()).toEqual<RedisOptions>({
                name: masterName,
                sentinels: [
                    { host: 'host1', port: 26379 },
                    { host: 'host2', port: REDIS_SENTINEL_DEFAULT_PORT },
                ],
                username,
                password,
                sentinelPassword: password,
                db: parseInt(dbIndex, 10),
                maxRetriesPerRequest: null,
                enableTLSForSentinelMode: true,
                tls: {
                    rejectUnauthorized: true,
                },
                sentinelTLS: {
                    rejectUnauthorized: true,
                },
            })
        })

        it('should pass optional trusted CA contents to both production Sentinel TLS connections', async () => {
            const trustedCa = 'sentinel-trusted-ca-contents'
            factory = await createFactory(url, {
                NODE_ENV: 'production',
                REDIS_TLS_CA: trustedCa,
            })

            const options = factory.create()
            const expectedTls = {
                rejectUnauthorized: true,
                ca: trustedCa,
            }

            expect(options.tls).toEqual(expectedTls)
            expect(options.sentinelTLS).toEqual(expectedTls)
            expect(options.enableTLSForSentinelMode).toBe(true)
        })

        it('should throw a stable error on a missing master name', async () => {
            const badUrl = `redis-sentinel://${username}:${password}@${hostsStr}/${dbIndex}`
            factory = await createFactory(badUrl)

            expect(() => factory.create()).toThrow('REDIS_URL: missing-sentinel-master-name')
        })

        it.each(['not-a-number', '-1', '1.5'])(
            'should throw a stable error on invalid database index %s',
            async invalidDatabase => {
                const badUrl = `redis-sentinel://${username}:${password}@${hostsStr}/${invalidDatabase}?name=${masterName}`
                factory = await createFactory(badUrl)

                expect(() => factory.create()).toThrow('REDIS_URL: invalid-database-index')
                expect(() => factory.create()).not.toThrow(password)
            },
        )

        it('should throw a stable error on an invalid Sentinel URL', async () => {
            factory = await createFactory('redis-sentinel://')

            expect(() => factory.create()).toThrow('REDIS_URL: invalid-sentinel-url')
        })

        it('should redact invalid Sentinel port details', async () => {
            const invalidPort = 'sentinel-port-secret'
            const badUrl = `redis-sentinel://${username}:${password}@host:${invalidPort}/${dbIndex}?name=${masterName}`
            factory = await createFactory(badUrl, { NODE_ENV: 'production' })

            expect(() => factory.create()).toThrow('REDIS_URL: invalid-sentinel-port')

            try {
                factory.create()
            } catch (error) {
                expect(String(error)).not.toContain(badUrl)
                expect(String(error)).not.toContain(invalidPort)
                expect(String(error)).not.toContain(password)
            }
        })
    })

    describe('invalid prefix', () => {
        it('should throw a stable error on an unsupported URI scheme without exposing the configured value', async () => {
            const configuredValue = 'http://user:scheme-secret@private-redis'
            factory = await createFactory(configuredValue, { NODE_ENV: 'production' })

            expect(() => factory.create()).toThrow('REDIS_URL: unsupported-scheme')

            try {
                factory.create()
            } catch (error) {
                expect(String(error)).not.toContain(configuredValue)
                expect(String(error)).not.toContain('scheme-secret')
                expect(String(error)).not.toContain('private-redis')
            }
        })
    })
})
