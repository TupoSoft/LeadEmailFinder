import type { Redis } from 'ioredis'
import { ok } from 'node:assert'

export interface CatchAllCache {
    getCatchAllStatusForDomain: (domain: string) => Promise<boolean | undefined>
    setCatchAllStatusForDomain: (domain: string, status: boolean) => Promise<void>
}

export class RedisCatchAllCache implements CatchAllCache {
    private readonly cacheKeyPrefix = 'CATCH_ALL_STATUS'

    constructor(private readonly redis: Redis) {}

    async getCatchAllStatusForDomain(domain: string): Promise<boolean | undefined> {
        try {
            const key = this.getKey(domain)
            const catchAllStatus = await this.redis.get(key)
            return catchAllStatus != null ? catchAllStatus !== 'false' : undefined
        } catch (error) {
            return undefined
        }
    }

    async setCatchAllStatusForDomain(domain: string, status: boolean): Promise<void> {
        const errorMessage = `Failed to cache catch all status '${status}' for domain '${domain}'`

        try {
            const key = this.getKey(domain)
            await this.redis.set(key, JSON.stringify(status))
        } catch (error) {
            ok(error instanceof Error, new Error(errorMessage))
            throw error
        }
    }

    private getKey(domain: string): string {
        return `${this.cacheKeyPrefix}:${domain}`
    }
}
