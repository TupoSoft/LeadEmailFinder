import type { Redis } from 'ioredis'
import { type DNSTypeMap, fetchRecords } from './util'
import console from 'node:console'
import type { Logger } from '../logging'
import { parseTimeString } from '../util/time'

export interface DNSCache {
    resolve: <T extends keyof DNSTypeMap>(name: string, type: T) => Promise<DNSTypeMap[T]>
}

export class DNSCacheImpl implements DNSCache {
    public static readonly DEFAULT_TTL_SECONDS = parseTimeString('1d')
    public static readonly DEFAULT_CACHE_KEY_PREFIX = 'DNS_CACHE'

    constructor(
        private readonly redisClient: Redis,
        private readonly ttlSeconds = DNSCacheImpl.DEFAULT_TTL_SECONDS,
        private readonly cacheKeyPrefix = DNSCacheImpl.DEFAULT_CACHE_KEY_PREFIX,
        private readonly logger: Logger = console,
    ) {}

    async resolve<T extends keyof DNSTypeMap>(name: string, type: T): Promise<DNSTypeMap[T]> {
        name = name.toLowerCase()

        const cachedRecords = await this.getCachedRecords<T>(name, type)
        if (cachedRecords != null) {
            this.logger.debug(`Using cached ${type} records for ${name}`)
            return cachedRecords
        }

        this.logger.debug(`Fetching ${type} records for ${name}`)
        const records = await fetchRecords(name, type)

        await this.cacheRecords(name, type, records)

        return records
    }

    private async getCachedRecords<T extends keyof DNSTypeMap>(name: string, type: T): Promise<DNSTypeMap[T] | null> {
        const cached: string | null = await this.redisClient.get(this.getCacheKey(name, type))
        return cached !== null ? (JSON.parse(cached) as DNSTypeMap[T]) : null
    }

    private async cacheRecords<T extends keyof DNSTypeMap>(
        domain: string,
        type: T,
        records: DNSTypeMap[T],
    ): Promise<void> {
        const cacheKey = this.getCacheKey(domain, type)
        await this.redisClient.set(cacheKey, JSON.stringify(records), 'EX', this.ttlSeconds)
    }

    private getCacheKey<T extends keyof DNSTypeMap>(name: string, type: T): string {
        return `${this.cacheKeyPrefix}:${type}:${name}`
    }
}
