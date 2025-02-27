import type { Redis } from 'ioredis'
import { ok } from 'node:assert'

export interface CatchAllCache {
    isCatchAllEnabledForDomain: (domain: string) => Promise<boolean | null>
    setCatchAllEnabledForDomain: (domain: string, status: boolean) => Promise<void>
}

export class RedisCatchAllCache implements CatchAllCache {
    private static readonly CATCH_ALL_CACHE_EXPIRY = 86400
    private readonly cacheKeyPrefix = 'CATCH_ALL_STATUS'

    constructor(private readonly redis: Redis) {}

    async isCatchAllEnabledForDomain(domain: string): Promise<boolean | null> {
        try {
            const key = this.getKey(domain)
            const result = await this.redis.get(key)
            return result != null ? result === 'true' : null
        } catch (error) {
            return null
        }
    }

    async setCatchAllEnabledForDomain(domain: string, status: boolean): Promise<void> {
        const errorMessage = `Failed to cache catch all status '${status}' for domain '${domain}'`

        try {
            const key = this.getKey(domain)
            await this.redis.set(key, String(status), 'EX', RedisCatchAllCache.CATCH_ALL_CACHE_EXPIRY)
        } catch (error) {
            ok(error instanceof Error, new Error(errorMessage))
            throw error
        }
    }

    private getKey(domain: string): string {
        return `${this.cacheKeyPrefix}:${domain}`
    }
}
