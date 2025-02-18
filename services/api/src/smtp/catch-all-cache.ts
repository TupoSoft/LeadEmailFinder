import type { Redis } from 'ioredis'
import { ok } from 'node:assert'
import { CatchAllStatus } from './dto'
import { isCatchAllStatus } from './type-guards'

export interface CatchAllCache {
    getCatchAllStatusForDomain: (domain: string) => Promise<CatchAllStatus>
    setCatchAllStatusForDomain: (domain: string, status: CatchAllStatus) => Promise<void>
}

export class RedisCatchAllCache implements CatchAllCache {
    private readonly cacheKeyPrefix = 'CATCH_ALL_STATUS'

    constructor(private readonly redis: Redis) {}

    async getCatchAllStatusForDomain(domain: string): Promise<CatchAllStatus> {
        try {
            const key = this.getKey(domain)
            const catchAllStatus = await this.redis.get(key)

            ok(catchAllStatus !== null)
            ok(isCatchAllStatus(catchAllStatus))

            return catchAllStatus
        } catch (error) {
            return CatchAllStatus.Unknown
        }
    }

    async setCatchAllStatusForDomain(domain: string, status: CatchAllStatus): Promise<void> {
        const errorMessage = `Failed to cache catch all status '${status}' for domain '${domain}'`

        try {
            const key = this.getKey(domain)
            await this.redis.set(key, status)
        } catch (error) {
            ok(error instanceof Error, new Error(errorMessage))
            throw error
        }
    }

    private getKey(domain: string): string {
        return `${this.cacheKeyPrefix}:${domain}`
    }
}
