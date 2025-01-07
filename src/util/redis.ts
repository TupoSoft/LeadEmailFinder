import { Redis, type RedisOptions } from 'ioredis'
import type { ConfigService, Environment } from '../common'
import { EXIT_FAILURE } from '../common'
import type { Logger } from '../logging'

export class RedisCreator {
    constructor(
        private readonly configService: ConfigService<Environment>,
        private readonly logger: Logger,
    ) {}

    create(): Redis {
        try {
            const redisConfig = this.configService.get('REDIS_CONFIG')
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- TODO: add a type guard
            const config = JSON.parse(redisConfig) as RedisOptions
            return new Redis(config)
        } catch (error) {
            this.logger.error(`Failed to initialize redis: ${String(error)}`)
            process.exit(EXIT_FAILURE)
        }
    }
}
