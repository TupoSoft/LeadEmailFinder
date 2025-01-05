import { Redis, type RedisOptions } from 'ioredis'
import { ok } from 'node:assert'
import { isNativeError } from 'node:util/types'
import { EXIT_FAILURE } from '../common/constants'
import { REDIS_CONFIG } from '../common/env'

export function getRedis(): Redis {
    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- temporary
        const config = JSON.parse(REDIS_CONFIG) as RedisOptions
        return new Redis(config)
    } catch (error) {
        ok(isNativeError(error))
        console.error(`Failed to initialize Redis: `, error)
        process.exit(EXIT_FAILURE)
    }
}
