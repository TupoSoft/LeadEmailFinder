import { Inject, Injectable } from '@nestjs/common'
import { Redis } from 'ioredis'
import { generateSessionId } from '../../application/pkce'
import { SessionRecord } from '../../domain/session-record'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../config/bff-session-configuration'
import { SessionEncryptor } from '../crypto/session-encryptor'
import { withRedisTimeout } from './redis-timeout'

const KEY_PREFIX = 'bff-session'

@Injectable()
export class RedisSessionStore {
    constructor(
        @Inject(Redis) private readonly redis: Redis,
        private readonly encryptor: SessionEncryptor,
        @Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BffSessionConfiguration,
    ) {}

    async create(record: SessionRecord): Promise<string> {
        const sessionId = generateSessionId()
        await this.save(sessionId, record)
        return sessionId
    }

    async get(sessionId: string): Promise<SessionRecord | undefined> {
        const ciphertext = await withRedisTimeout('session:get', this.redis.get(this.key(sessionId)))

        if (!ciphertext) {
            return undefined
        }

        const record = await this.encryptor.decrypt(ciphertext)

        if (!record || record.absoluteExpiresAt <= Date.now()) {
            return undefined
        }

        return record
    }

    async save(sessionId: string, record: SessionRecord): Promise<void> {
        const idleTimeoutSeconds = Math.ceil(this.configuration.sessionIdleTimeoutMs / 1000)
        const remainingAbsoluteSeconds = Math.ceil((record.absoluteExpiresAt - Date.now()) / 1000)
        const ttlSeconds = Math.max(1, Math.min(idleTimeoutSeconds, remainingAbsoluteSeconds))
        const ciphertext = await this.encryptor.encrypt(record)

        await withRedisTimeout('session:save', this.redis.set(this.key(sessionId), ciphertext, 'EX', ttlSeconds))
    }

    async delete(sessionId: string): Promise<void> {
        await withRedisTimeout('session:delete', this.redis.del(this.key(sessionId)))
    }

    private key(sessionId: string): string {
        return `${KEY_PREFIX}:${sessionId}`
    }
}
