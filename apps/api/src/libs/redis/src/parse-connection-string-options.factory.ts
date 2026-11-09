import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { RedisOptions, SentinelAddress } from 'ioredis'
import type { ConnectionOptions } from 'node:tls'
import {
    REDIS_DEFAULT_DB_INDEX,
    REDIS_DEFAULT_PORT,
    REDIS_SENTINEL_DEFAULT_PORT,
    REDIS_SENTINEL_URL_REGEX,
} from './redis.constants'
import { RedisSentinelUrlParts } from './redis-sentinel-url-parts.interface'

type RedisUrlErrorReason =
    | 'insecure-transport'
    | 'invalid-database-index'
    | 'invalid-sentinel-host'
    | 'invalid-sentinel-port'
    | 'invalid-sentinel-url'
    | 'invalid-url'
    | 'missing-sentinel-master-name'
    | 'unsupported-scheme'

function redisUrlError(reason: RedisUrlErrorReason): Error {
    return new Error(`REDIS_URL: ${reason}`)
}

@Injectable()
export class ParseConnectionStringOptionsFactory {
    private readonly redisUrl: string
    private readonly isProduction: boolean
    private readonly redisTlsCa?: string

    constructor(configService: ConfigService) {
        const redisUrl = configService.get<string>('REDIS_URL')

        if (redisUrl === undefined) {
            throw new Error('REDIS_URL: missing')
        }

        this.redisUrl = redisUrl
        this.isProduction = configService.get<string>('NODE_ENV') === 'production'
        this.redisTlsCa = configService.get<string>('REDIS_TLS_CA')
    }

    create(): RedisOptions {
        const parsedOptions = this.parseRedisUrl()

        return {
            maxRetriesPerRequest: null,
            ...parsedOptions,
        }
    }

    private parseRedisUrl(): RedisOptions {
        if (this.redisUrl.startsWith('redis-sentinel://')) {
            return this.parseRedisSentinelUrl()
        }

        if (this.redisUrl.startsWith('rediss://')) {
            return this.parseRedisStandaloneUrl(true)
        }

        if (this.redisUrl.startsWith('redis://')) {
            if (this.isProduction) {
                throw redisUrlError('insecure-transport')
            }

            return this.parseRedisStandaloneUrl(false)
        }

        throw redisUrlError('unsupported-scheme')
    }

    private parseRedisSentinelUrl(): RedisOptions {
        const match = REDIS_SENTINEL_URL_REGEX.exec(this.redisUrl)
        if (match?.groups === undefined) {
            throw redisUrlError('invalid-sentinel-url')
        }

        const { groups } = match
        const { username, password, hosts, database, query } = groups as RedisSentinelUrlParts
        if (hosts === undefined) {
            throw redisUrlError('invalid-sentinel-host')
        }

        const db = database !== undefined ? Number(database) : undefined
        if (db !== undefined && (!Number.isInteger(db) || db < 0)) {
            throw redisUrlError('invalid-database-index')
        }

        const sentinels: SentinelAddress[] = hosts.split(',').map(value => {
            const [hostname, sentinelPort = String(REDIS_SENTINEL_DEFAULT_PORT)] = value.split(':') as Array<
                string | undefined
            >
            if (hostname === undefined || hostname === '') {
                throw redisUrlError('invalid-sentinel-host')
            }

            const port = parseInt(sentinelPort)
            if (isNaN(port)) {
                throw redisUrlError('invalid-sentinel-port')
            }

            return {
                host: hostname,
                port,
            }
        })

        const searchParams = new URLSearchParams(query)
        const name = searchParams.get('name')
        if (name === null) {
            throw redisUrlError('missing-sentinel-master-name')
        }

        const options: RedisOptions = {
            name,
            sentinels,
            username,
            password,
            sentinelPassword: password,
            db,
        }

        if (!this.isProduction) {
            return options
        }

        const tls = this.createVerifiedTlsOptions()

        return {
            ...options,
            enableTLSForSentinelMode: true,
            tls,
            sentinelTLS: tls,
        }
    }

    private parseRedisStandaloneUrl(useTls: boolean): RedisOptions {
        let parsedUrl: URL

        try {
            parsedUrl = new URL(this.redisUrl)
        } catch {
            throw redisUrlError('invalid-url')
        }

        const { hostname, port, username, password, pathname } = parsedUrl

        const options: RedisOptions = {
            host: hostname,
            port: port !== '' ? parseInt(port, 10) : REDIS_DEFAULT_PORT,
            db: pathname !== '' ? parseInt(pathname.replace('/', ''), 10) : REDIS_DEFAULT_DB_INDEX,
            username: username !== '' ? username : undefined,
            password: password !== '' ? password : undefined,
        }

        if (options.db === undefined || isNaN(options.db)) {
            throw redisUrlError('invalid-database-index')
        }

        if (useTls) {
            options.tls = this.createVerifiedTlsOptions()
        }

        return options
    }

    private createVerifiedTlsOptions(): ConnectionOptions {
        return {
            rejectUnauthorized: true,
            ...(this.redisTlsCa === undefined ? {} : { ca: this.redisTlsCa }),
        }
    }
}
