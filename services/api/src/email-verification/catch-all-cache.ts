import type { Redis } from 'ioredis'
import { ok } from 'node:assert'
import type { SmtpVerificationResult } from '../smtp/dto'
import { smtpVerificationResultValidationSchema } from '../smtp/validation'

export interface CatchAllSmtpVerificationResultRepository {
    getCatchAllSmtpVerificationResult: (domain: string) => Promise<SmtpVerificationResult | null>
    setCatchAllSmtpVerificationResult: (domain: string, verificationResult: SmtpVerificationResult) => Promise<void>
}

export class RedisCatchAllCache implements CatchAllSmtpVerificationResultRepository {
    private static readonly CATCH_ALL_CACHE_EXPIRY = 86400
    private readonly cacheKeyPrefix = 'CATCH_ALL_STATUS'

    constructor(private readonly redis: Redis) {}

    private static isSmtpVerificationResult(value: unknown): value is SmtpVerificationResult {
        return smtpVerificationResultValidationSchema.safeParse(value).success
    }

    async getCatchAllSmtpVerificationResult(domain: string): Promise<SmtpVerificationResult | null> {
        try {
            const key = this.getKey(domain)
            const rawValue = await this.redis.get(key)
            ok(rawValue != null)

            const value: unknown = JSON.parse(rawValue)
            ok(RedisCatchAllCache.isSmtpVerificationResult(value))

            return value
        } catch (error) {
            return null
        }
    }

    async setCatchAllSmtpVerificationResult(domain: string, verificationResult: SmtpVerificationResult): Promise<void> {
        try {
            const key = this.getKey(domain)
            await this.redis.set(
                key,
                JSON.stringify(verificationResult),
                'EX',
                RedisCatchAllCache.CATCH_ALL_CACHE_EXPIRY,
            )
        } catch (error) {
            ok(
                error instanceof Error,
                new Error(
                    `Failed to cache catch all verification result '${JSON.stringify(verificationResult)}' for domain '${domain}'`,
                ),
            )
            throw error
        }
    }

    private getKey(domain: string): string {
        return `${this.cacheKeyPrefix}:${domain}`
    }
}
