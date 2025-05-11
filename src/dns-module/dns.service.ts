import { Redis } from 'ioredis'
import { fetchRecords } from './util'
import { parseTimeString } from '../util/time'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { DNSTypeMap, IDnsService } from '../common'

@Injectable()
export class DnsService implements IDnsService {
    public static readonly DEFAULT_TTL_SECONDS = parseTimeString('1d')
    public static readonly DEFAULT_CACHE_KEY_PREFIX = 'DNS_CACHE'

    private readonly logger = new Logger(DnsService.name)

    constructor(
        @Inject(Redis) private readonly redis: Redis,
        @Optional() private readonly ttlSeconds = DnsService.DEFAULT_TTL_SECONDS,
        @Optional() private readonly cacheKeyPrefix = DnsService.DEFAULT_CACHE_KEY_PREFIX,
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
        const cached: string | null = await this.redis.get(this.getCacheKey(name, type))
        return cached !== null ? (JSON.parse(cached) as DNSTypeMap[T]) : null
    }

    private async cacheRecords<T extends keyof DNSTypeMap>(
        domain: string,
        type: T,
        records: DNSTypeMap[T],
    ): Promise<void> {
        const cacheKey = this.getCacheKey(domain, type)
        await this.redis.set(cacheKey, JSON.stringify(records), 'EX', this.ttlSeconds)
    }

    private getCacheKey<T extends keyof DNSTypeMap>(name: string, type: T): string {
        return `${this.cacheKeyPrefix}:${type}:${name}`
    }
}
