import { describe, expect, it } from '@jest/globals'

import { parseRedisSentinelUrl, parseRedisStandaloneUrl, parseRedisUrl } from './redis'

describe('Redis URL Parsing', () => {
    describe('parseRedisStandaloneUrl', () => {
        it('should parse a valid standalone Redis URI with all components', () => {
            const redisUri = 'redis://user:password@localhost:6379/1'
            const result = parseRedisStandaloneUrl(redisUri)
            expect(result).toEqual({
                host: 'localhost',
                port: 6379,
                db: 1,
                username: 'user',
                password: 'password',
            })
        })

        it('should default to port 6379 and database 0 if not specified', () => {
            const redisUri = 'redis://localhost'
            const result = parseRedisStandaloneUrl(redisUri)
            expect(result).toEqual({
                host: 'localhost',
                port: 6379,
                db: 0,
            })
        })

        it('should throw an error for invalid port', () => {
            const redisUri = 'redis://localhost:invalid_port'
            expect(() => parseRedisStandaloneUrl(redisUri)).toThrow('Invalid URL')
        })

        it('should throw an error for invalid database index', () => {
            const redisUri = 'redis://localhost:6379/invalid_db'
            expect(() => parseRedisStandaloneUrl(redisUri)).toThrow('Invalid Redis database index in path: /invalid_db')
        })
    })

    describe('parseRedisSentinelUrl', () => {
        it('should parse a valid sentinel Redis URI', () => {
            const name = 'mymaster'
            const password = 'odjeseneradi'
            const redisUri = `redis-sentinel://${password}@redis_sentinel_1,redis_sentinel_2,redis_sentinel_3?sentinelMasterId=${name}`
            const result = parseRedisSentinelUrl(redisUri)
            expect(result).toEqual({
                name,
                sentinels: [
                    { host: 'redis_sentinel_1', port: 26379 },
                    { host: 'redis_sentinel_2', port: 26379 },
                    { host: 'redis_sentinel_3', port: 26379 },
                ],
                password,
                sentinelPassword: password,
            })
        })

        it('should default to sentinel port 26379 if not specified', () => {
            const redisUri = 'redis-sentinel://localhost?sentinelMasterId=mymaster'
            const result = parseRedisSentinelUrl(redisUri)
            expect(result).toEqual({
                name: 'mymaster',
                sentinels: [{ host: 'localhost', port: 26379 }],
            })
        })

        it('should throw an error if sentinelMasterId is missing', () => {
            const redisUri = 'redis-sentinel://localhost:26379'
            expect(() => parseRedisSentinelUrl(redisUri)).toThrow('Sentinel Master ID is missing')
        })

        it('should throw an error for invalid sentinel host', () => {
            const redisUri = 'redis-sentinel://:26379?sentinelMasterId=mymaster'
            expect(() => parseRedisSentinelUrl(redisUri)).toThrow('Hostname cannot be empty')
        })

        it('should throw an error for invalid sentinel port', () => {
            const redisUri = 'redis-sentinel://localhost:invalid_port?sentinelMasterId=mymaster'
            expect(() => parseRedisSentinelUrl(redisUri)).toThrow(`Invalid port: invalid_port, not a number`)
        })
    })

    describe('parseRedisUrl', () => {
        it('should parse a standalone Redis URI', () => {
            const redisUri = 'redis://localhost:6379'
            const result = parseRedisUrl(redisUri)
            expect(result).toEqual({
                host: 'localhost',
                port: 6379,
                db: 0,
            })
        })

        it('should parse a sentinel Redis URI', () => {
            const redisUri = 'redis-sentinel://localhost:26379?sentinelMasterId=mymaster'
            const result = parseRedisUrl(redisUri)
            expect(result).toEqual({
                name: 'mymaster',
                sentinels: [{ host: 'localhost', port: 26379 }],
            })
        })

        it('should throw an error for unsupported protocol', () => {
            const redisUri = 'http://localhost:6379'
            expect(() => parseRedisUrl(redisUri)).toThrow('Invalid redis URI')
        })
    })
})
