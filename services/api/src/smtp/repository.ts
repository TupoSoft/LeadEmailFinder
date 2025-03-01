import type { Redis } from 'ioredis'
import { ok } from 'node:assert'
import type { SmtpVerificationResult } from './dto'
import { smtpVerificationResultValidationSchema } from './validation'

export interface SmtpVerificationResultRepository {
    getById: (id: string) => Promise<SmtpVerificationResult | null>
    save: (verificationResult: SmtpVerificationResult) => Promise<void>
}

export class RedisSmtpVerificationResultRepository implements SmtpVerificationResultRepository {
    private static readonly CACHE_EXPIRY = 86400
    private static readonly CACHE_KEY_PREFIX = 'CATCH_ALL_STATUS'

    constructor(private readonly redis: Redis) {}

    private static isSmtpVerificationResult(value: unknown): value is SmtpVerificationResult {
        return smtpVerificationResultValidationSchema.safeParse(value).success
    }

    private static getKey(domain: string): string {
        return `${this.CACHE_KEY_PREFIX}:${domain}`
    }

    async getById(domain: string): Promise<SmtpVerificationResult | null> {
        try {
            const key = RedisSmtpVerificationResultRepository.getKey(domain)

            const rawValue = await this.redis.get(key)
            ok(rawValue != null)

            const value: unknown = JSON.parse(rawValue)
            ok(RedisSmtpVerificationResultRepository.isSmtpVerificationResult(value))

            return value
        } catch (error) {
            return null
        }
    }

    async save(verificationResult: SmtpVerificationResult): Promise<void> {
        try {
            const key = RedisSmtpVerificationResultRepository.getKey(verificationResult.email)

            await this.redis.set(
                key,
                JSON.stringify(verificationResult),
                'EX',
                RedisSmtpVerificationResultRepository.CACHE_EXPIRY,
            )
        } catch (error) {
            ok(
                error instanceof Error,
                new Error(
                    `Failed to save SMTP verification result '${JSON.stringify(verificationResult)}' for email '${verificationResult.email}'`,
                ),
            )
            throw error
        }
    }
}
