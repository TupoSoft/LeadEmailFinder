import { fetchRecords, DNSTypeMap, IDnsService } from './util'

interface CacheEntry {
    records: DNSTypeMap[keyof DNSTypeMap]
    expiresAt: number
}

/** Process-local bounded DNS cache; cached addresses still require destination validation before connecting. */
export class DnsService implements IDnsService {
    public static readonly DEFAULT_TTL_SECONDS = 86_400
    private readonly cache = new Map<string, CacheEntry>()

    constructor(
        private readonly ttlSeconds = DnsService.DEFAULT_TTL_SECONDS,
        private readonly maxEntries = 10_000,
    ) {
        const invalidTtl = !Number.isFinite(ttlSeconds) || ttlSeconds < 0
        const invalidCapacity = !Number.isInteger(maxEntries) || maxEntries < 1

        if (invalidTtl || invalidCapacity) {
            throw new Error('dns_cache_configuration_invalid')
        }
    }

    async resolve<T extends keyof DNSTypeMap>(name: string, type: T, signal?: AbortSignal): Promise<DNSTypeMap[T]> {
        signal?.throwIfAborted()

        const normalizedName = name.toLowerCase()
        const key = `${type}:${normalizedName}`
        const cached = this.cache.get(key)

        if (cached && cached.expiresAt > Date.now()) {
            this.cache.delete(key)
            this.cache.set(key, cached)

            return structuredClone(cached.records) as DNSTypeMap[T]
        }

        if (cached) {
            this.cache.delete(key)
        }

        const records = await fetchRecords(normalizedName, type, signal)

        signal?.throwIfAborted()

        this.cache.set(key, {
            records: structuredClone(records),
            expiresAt: Date.now() + this.ttlSeconds * 1000,
        })
        if (this.cache.size > this.maxEntries) {
            const oldestKey = this.cache.keys().next().value!
            this.cache.delete(oldestKey)
        }

        return records
    }
}
