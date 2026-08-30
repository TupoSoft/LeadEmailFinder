import { Inject, Injectable } from '@nestjs/common'
import { Redis } from 'ioredis'
import { PendingLoginStateStore } from '../../application/pending-login-state-store'
import { PendingLoginState } from '../../domain/pending-login-state'
import { withRedisTimeout } from './redis-timeout'

const KEY_PREFIX = 'bff-login-state'
const PENDING_LOGIN_TTL_SECONDS = 600

@Injectable()
export class RedisPendingLoginStateStore implements PendingLoginStateStore {
    constructor(@Inject(Redis) private readonly redis: Redis) {}

    async create(state: string, pendingLoginState: PendingLoginState): Promise<void> {
        await withRedisTimeout(
            'login-state:create',
            this.redis.set(this.key(state), JSON.stringify(pendingLoginState), 'EX', PENDING_LOGIN_TTL_SECONDS),
        )
    }

    async consume(state: string): Promise<PendingLoginState | undefined> {
        const raw = await withRedisTimeout('login-state:consume', this.redis.get(this.key(state)))

        if (!raw) {
            return undefined
        }

        await withRedisTimeout('login-state:consume-delete', this.redis.del(this.key(state)))

        return JSON.parse(raw) as PendingLoginState
    }

    private key(state: string): string {
        return `${KEY_PREFIX}:${state}`
    }
}
