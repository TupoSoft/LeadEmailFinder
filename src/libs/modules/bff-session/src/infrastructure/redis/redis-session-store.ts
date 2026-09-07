import { Inject, Injectable } from '@nestjs/common'
import { Redis } from 'ioredis'
import { generateSessionId } from '../../application/pkce'
import { SessionMissingError, SessionStore } from '../../application/session-store'
import { SessionRecord } from '../../domain/session-record'
import { BFF_SESSION_CONFIGURATION, BffSessionConfiguration } from '../../application/bff-session-configuration'
import { SessionEncryptor } from '../crypto/session-encryptor'
import { withRedisTimeout } from './redis-timeout'

const KEY_PREFIX = 'bff-session'

// Validate before writing. A missing expected session never permits a fresh insert.
const REPLACE_SESSION_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 or redis.call('EXISTS', KEYS[2]) ~= 0 then
    return 0
end
redis.call('SET', KEYS[2], ARGV[1], 'PX', ARGV[2])
redis.call('DEL', KEYS[1])
return 1
`

@Injectable()
export class RedisSessionStore implements SessionStore {
    constructor(
        @Inject(Redis) private readonly redis: Redis,
        private readonly encryptor: SessionEncryptor,
        @Inject(BFF_SESSION_CONFIGURATION) private readonly configuration: BffSessionConfiguration,
    ) {}

    async create(record: SessionRecord): Promise<string> {
        const sessionId = generateSessionId()
        const ciphertext = await this.encryptor.encrypt(record)
        const result = await withRedisTimeout(
            'session:create',
            this.redis.set(this.key(sessionId), ciphertext, 'PX', this.ttl(record), 'NX'),
        )
        if (result !== 'OK') throw new Error('Could not create a browser session')
        return sessionId
    }

    async replace(expectedSessionId: string, newSessionId: string, record: SessionRecord): Promise<boolean> {
        if (expectedSessionId === newSessionId) return false
        const ciphertext = await this.encryptor.encrypt(record)
        const result = await withRedisTimeout(
            'session:replace',
            this.redis.eval(
                REPLACE_SESSION_SCRIPT,
                2,
                this.key(expectedSessionId),
                this.key(newSessionId),
                ciphertext,
                this.ttl(record),
            ),
        )
        return result === 1
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
        const ciphertext = await this.encryptor.encrypt(record)
        const result = await withRedisTimeout(
            'session:save',
            this.redis.set(this.key(sessionId), ciphertext, 'PX', this.ttl(record), 'XX'),
        )
        if (result !== 'OK') throw new SessionMissingError()
    }

    async delete(sessionId: string): Promise<void> {
        await withRedisTimeout('session:delete', this.redis.del(this.key(sessionId)))
    }

    private ttl(record: SessionRecord): number {
        const remainingAbsoluteMs = record.absoluteExpiresAt - Date.now()
        if (remainingAbsoluteMs <= 0) throw new SessionMissingError()
        return Math.max(1, Math.min(this.configuration.sessionIdleTimeoutMs, remainingAbsoluteMs))
    }

    private key(sessionId: string): string {
        return `${KEY_PREFIX}:${sessionId}`
    }
}
