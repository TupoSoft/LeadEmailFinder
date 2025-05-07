import { DynamicModule, Module, Provider } from '@nestjs/common'
import {
    ASYNC_OPTIONS_TYPE,
    ConfigurableModuleClass,
    MODULE_OPTIONS_TOKEN,
    OPTIONS_TYPE,
} from './redis.module-definition'
import { Redis } from 'ioredis'

@Module({})
export class RedisModule extends ConfigurableModuleClass {
    static register(options: typeof OPTIONS_TYPE): DynamicModule {
        const { providers = [], ...dynamicModule } = super.register(options)

        return {
            providers: [this.createRedisProvider(), ...providers],
            ...dynamicModule,
        }
    }

    static registerAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
        const { providers = [], ...dynamicModule } = super.registerAsync(options)

        return {
            providers: [this.createRedisProvider(), ...providers],
            ...dynamicModule,
        }
    }

    private static createRedisProvider(): Provider {
        return {
            provide: Redis,
            inject: [MODULE_OPTIONS_TOKEN],
            useFactory: (options: typeof OPTIONS_TYPE) => new Redis(options),
        }
    }
}
