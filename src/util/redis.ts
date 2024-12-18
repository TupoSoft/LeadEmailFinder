import { Redis, type RedisOptions } from 'ioredis'
import { readFile } from 'fs/promises'
import { ok } from 'node:assert'
import { isNativeError } from 'node:util/types'
import { EXIT_FAILURE } from '../common/constants'

export async function getRedis(): Promise<Redis> {
    try {
        const { env } = process
        const { REDIS_CONFIG_FILE_PATH } = env
        ok(REDIS_CONFIG_FILE_PATH !== undefined)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- temporary
        const config = JSON.parse(await readFile(REDIS_CONFIG_FILE_PATH, 'ascii')) as RedisOptions
        return new Redis(config)
    } catch (error) {
        ok(isNativeError(error))
        console.error(`Failed to initialize Redis: `, error)
        process.exit(EXIT_FAILURE)
    }
}
