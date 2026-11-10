import { LRUCache } from 'lru-cache'
import { fetchRecords, DNSTypeMap, IDnsService } from './util'

/** Process-local bounded DNS cache; cached addresses still require destination validation before connecting. */
export class DnsService implements IDnsService {
    public static readonly DEFAULT_TTL_SECONDS = 86_400
    private readonly cache: LRUCache<string, DNSTypeMap[keyof DNSTypeMap]>

    constructor(
        private readonly ttlSeconds = DnsService.DEFAULT_TTL_SECONDS,
        maxEntries = 10_000,
    ) {
        const invalidTtl = !Number.isFinite(ttlSeconds) || ttlSeconds < 0
        const invalidCapacity = !Number.isInteger(maxEntries) || maxEntries < 1

        if (invalidTtl || invalidCapacity) {
            throw new Error('dns_cache_configuration_invalid')
        }

        this.cache = new LRUCache({
            max: maxEntries,
            ttl: Math.ceil(ttlSeconds * 1000),
        })
    }

    async resolve<T extends keyof DNSTypeMap>(name: string, type: T, signal?: AbortSignal): Promise<DNSTypeMap[T]> {
        signal?.throwIfAborted()

        const normalizedName = name.toLowerCase()
        const key = `${type}:${normalizedName}`
        const cached = this.cache.get(key)

        if (cached) {
            return structuredClone(cached) as DNSTypeMap[T]
        }

        const records = await fetchRecords(normalizedName, type, signal)

        signal?.throwIfAborted()

        // A zero TTL disables caching; lru-cache otherwise treats it as unlimited.
        if (this.ttlSeconds > 0) {
            this.cache.set(key, structuredClone(records))
        }

        return records
    }
}
