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
    static forRoot(options: typeof OPTIONS_TYPE): DynamicModule {
        const { global = true, providers = [], ...dynamicModule } = super.forRoot(options)

        return {
            global,
            providers: [this.createRedisProvider(), ...providers],
            ...dynamicModule,
        }
    }

    static forRootAsync(options: typeof ASYNC_OPTIONS_TYPE): DynamicModule {
        const { global = true, providers = [], ...dynamicModule } = super.forRootAsync(options)

        return {
            global,
            providers: [this.createRedisProvider(), ...providers],
            exports: [Redis],
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
