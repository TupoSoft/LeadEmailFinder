import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import { RedisOptions, type SentinelAddress } from 'ioredis'
import { ParseConnectionStringOptionsFactory } from './parse-connection-string-options.factory'
import { REDIS_DEFAULT_DB_INDEX, REDIS_DEFAULT_PORT, REDIS_SENTINEL_DEFAULT_PORT } from './redis.constants'

describe('ParseConnectionStringOptionsFactory', () => {
    let factory: ParseConnectionStringOptionsFactory
    let configService: Partial<ConfigService>

    const createFactory = async (redisUrl?: string) => {
        configService = {
            get: jest.fn().mockReturnValue(redisUrl),
        }

        const module: TestingModule = await Test.createTestingModule({
            providers: [ParseConnectionStringOptionsFactory, { provide: ConfigService, useValue: configService }],
        }).compile()

        return module.get<ParseConnectionStringOptionsFactory>(ParseConnectionStringOptionsFactory)
    }

    describe('constructor', () => {
        it('should throw if REDIS_URL is undefined', async () => {
            await expect(createFactory(undefined)).rejects.toThrow('REDIS_URL is not defined')
        })

        it('should set redisUrl if defined', async () => {
            factory = await createFactory('redis://localhost')
            expect(factory).toBeDefined()
        })
    })

    describe('parseRedisStandaloneUrl', () => {
        beforeAll(async () => {
            factory = await createFactory('redis://user:pass@myhost:6380/5')
        })

        it('should parse host, port, db, username, and password', () => {
            const opts = factory.create()
            expect(opts).toEqual<RedisOptions>({
                host: 'myhost',
                port: 6380,
                db: 5,
                username: 'user',
                password: 'pass',
                maxRetriesPerRequest: null,
            })
        })

        it('should default missing values', async () => {
            factory = await createFactory('redis://myhost')
            const opts = factory.create()
            expect(opts).toEqual<RedisOptions>({
                host: 'myhost',
                port: REDIS_DEFAULT_PORT,
                db: REDIS_DEFAULT_DB_INDEX,
                username: undefined,
                password: undefined,
                maxRetriesPerRequest: null,
            })
        })

        it('should throw on invalid db index', async () => {
            factory = await createFactory('redis://myhost/not-a-number')
            expect(() => factory.create()).toThrow('Invalid Redis database index in path: /not-a-number')
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

        beforeAll(async () => {
            factory = await createFactory(url)
        })

        it('should parse sentinel options correctly', () => {
            const opts = factory.create()
            const expectedSentinels: SentinelAddress[] = [
                { host: 'host1', port: 26379 },
                { host: 'host2', port: REDIS_SENTINEL_DEFAULT_PORT },
            ]

            expect(opts).toEqual<RedisOptions>({
                name: masterName,
                sentinels: expectedSentinels,
                username,
                password,
                sentinelPassword: password,
                db: parseInt(dbIndex, 10),
                maxRetriesPerRequest: null,
            })
        })

        it('should throw on missing name param', async () => {
            const badUrl = `redis-sentinel://${username}:${password}@${hostsStr}/${dbIndex}`
            factory = await createFactory(badUrl)
            expect(() => factory.create()).toThrow('The master group name is missing')
        })

        it.todo('should throw on invalid URL')
    })

    describe('invalid prefix', () => {
        it('should throw on unsupported URI scheme', async () => {
            factory = await createFactory('http://example.com')
            expect(() => factory.create()).toThrow('Invalid redis URI')
        })
    })
})
