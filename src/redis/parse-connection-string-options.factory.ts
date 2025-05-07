import { RedisOptions, type SentinelAddress } from 'ioredis'
import { ConfigService } from '@nestjs/config'
import { ok } from 'node:assert'
import {
    REDIS_DEFAULT_DB_INDEX,
    REDIS_DEFAULT_PORT,
    REDIS_SENTINEL_DEFAULT_PORT,
    REDIS_SENTINEL_URL_REGEX,
} from './redis.constants'
import { RedisSentinelUrlParts } from './interfaces'
import { Injectable } from '@nestjs/common'

@Injectable()
export class ParseConnectionStringOptionsFactory {
    private readonly redisUrl: string

    constructor(configService: ConfigService) {
        const redisUrl = configService.get<string>('REDIS_URL')

        if (redisUrl === undefined) {
            throw new Error('REDIS_URL is not defined')
        }

        this.redisUrl = redisUrl
    }

    create(): RedisOptions {
        return this.parseRedisUrl()
    }

    private parseRedisUrl(): RedisOptions {
        if (this.redisUrl.startsWith('redis://')) {
            return this.parseRedisStandaloneUrl()
        } else if (this.redisUrl.startsWith('redis-sentinel://')) {
            return this.parseRedisSentinelUrl()
        } else {
            throw new Error(`Invalid redis URI`)
        }
    }

    private parseRedisSentinelUrl(): RedisOptions {
        const match = REDIS_SENTINEL_URL_REGEX.exec(this.redisUrl)
        ok(match !== null, `Invalid Redis Sentinel URL: ${this.redisUrl}`)

        const { groups } = match
        ok(groups !== undefined, 'Invalid RegExp')

        const { username, password, hosts, database, query } = groups as RedisSentinelUrlParts
        ok(hosts !== undefined, 'There are no hosts in the URL')

        const db = database !== undefined ? parseInt(database) : undefined

        const sentinels: SentinelAddress[] = hosts.split(',').map(value => {
            const [hostname, sentinelPort = String(REDIS_SENTINEL_DEFAULT_PORT)] = value.split(':') as Array<
                string | undefined
            >
            ok(hostname !== undefined, 'Hostname cannot be undefined')
            ok(hostname !== '', 'Hostname cannot be empty')

            const port = parseInt(sentinelPort)
            ok(!isNaN(port), `Invalid port: ${sentinelPort}, not a number`)

            return {
                host: hostname,
                port,
            }
        })

        const searchParams = new URLSearchParams(query)
        const name = searchParams.get('name')
        ok(name !== null, 'The master group name is missing')

        return {
            name,
            sentinels,
            username,
            password,
            sentinelPassword: password,
            db,
        }
    }

    private parseRedisStandaloneUrl(): RedisOptions {
        const { hostname, port, username, password, pathname } = new URL(this.redisUrl)

        const options = {
            host: hostname,
            port: port !== '' ? parseInt(port, 10) : REDIS_DEFAULT_PORT,
            db: pathname !== '' ? parseInt(pathname.replace('/', ''), 10) : REDIS_DEFAULT_DB_INDEX,
            username: username !== '' ? username : undefined,
            password: password !== '' ? password : undefined,
        }

        ok(!isNaN(options.db), `Invalid Redis database index in path: ${pathname}`)

        return options
    }
}
