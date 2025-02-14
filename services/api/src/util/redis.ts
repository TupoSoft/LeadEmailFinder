import { Redis, type RedisOptions, type SentinelAddress } from 'ioredis'
import type { ConfigService, Environment } from '../common'
import { EXIT_FAILURE } from '../common'
import { ok } from 'node:assert'
import type { Logger } from 'logging'

const REDIS_DEFAULT_DB_INDEX = 0
const REDIS_DEFAULT_PORT = 6379
const REDIS_SENTINEL_DEFAULT_PORT = 26379
const REDIS_SENTINEL_URL_REGEX =
    /^(?:(?<scheme>[\w+-]+):\/\/)?(?:(?:(?<username>[^:@]+):)?(?<password>[^@]+)@)?(?<hosts>[^/?#]+)(?:\/(?<database>\d+))?(?:\?(?<query>.*?))?$/

interface RedisSentinelUrlParts {
    scheme?: string
    username?: string
    password?: string
    hosts?: string
    database?: string
    query?: string
}

export function parseRedisStandaloneUrl(redisUri: string): RedisOptions {
    const { hostname, port, username, password, pathname } = new URL(redisUri)

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

export function parseRedisSentinelUrl(redisUrl: string): RedisOptions {
    const match = REDIS_SENTINEL_URL_REGEX.exec(redisUrl)
    ok(match !== null, `Invalid Redis Sentinel URL: ${redisUrl}`)

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

export function parseRedisUrl(redisUrl: string): RedisOptions {
    if (redisUrl.startsWith('redis://')) {
        return parseRedisStandaloneUrl(redisUrl)
    } else if (redisUrl.startsWith('redis-sentinel://')) {
        return parseRedisSentinelUrl(redisUrl)
    } else {
        throw new Error(`Invalid redis URI`)
    }
}

export class RedisCreator {
    constructor(
        private readonly configService: ConfigService<Environment>,
        private readonly logger: Logger,
    ) {}

    create(): Redis {
        try {
            const redisUrl = this.configService.get('REDIS_URL')
            const redisOptions = parseRedisUrl(redisUrl)
            return new Redis({
                ...redisOptions,
                maxRetriesPerRequest: null, // for BullMQ
            })
        } catch (error) {
            this.logger.error(`Failed to initialize redis: ${String(error)}`)
            process.exit(EXIT_FAILURE)
        }
    }
}
