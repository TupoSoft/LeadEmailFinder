import { Inject, Module, OnApplicationShutdown } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { getDataSourceToken, TypeOrmModule } from '@nestjs/typeorm'
import {
    BETTER_AUTH_CONFIGURATION,
    BetterAuthConfiguration,
    createBetterAuthConfiguration,
} from './better-auth-configuration'
import { BETTER_AUTH_RUNTIME, BetterAuthRuntime, openBetterAuthRuntime } from './better-auth-runtime'
import { AUTH_MAIL_DELIVERY } from './mail/auth-mail-delivery'
import { BETTER_AUTH_ENTITIES } from './persistence/better-auth-entities'
import { NATIVE_HUMAN_USER_PROVISIONER } from './provisioning/native-human-user-provisioner'

class BetterAuthRuntimeLifecycle implements OnApplicationShutdown {
    constructor(@Inject(BETTER_AUTH_RUNTIME) private readonly runtime: BetterAuthRuntime) {}

    onApplicationShutdown(): Promise<void> {
        return this.runtime.close()
    }
}

/**
 * Composes the singleton native runtime. Importing it registers the mapped native tables for TypeORM
 * synchronization and validates its configuration; processes that do not import it need none of its settings.
 */
@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature(BETTER_AUTH_ENTITIES)],
    providers: [
        {
            provide: BETTER_AUTH_CONFIGURATION,
            useFactory: (config: ConfigService): BetterAuthConfiguration =>
                createBetterAuthConfiguration(name => config.get<unknown>(name)),
            inject: [ConfigService],
        },
        {
            provide: BETTER_AUTH_RUNTIME,
            // Waiting for the data source orders native startup after TypeORM synchronization creates its tables.
            useFactory: (configuration: BetterAuthConfiguration) => openBetterAuthRuntime(configuration),
            inject: [BETTER_AUTH_CONFIGURATION, getDataSourceToken()],
        },
        {
            provide: AUTH_MAIL_DELIVERY,
            useFactory: (runtime: BetterAuthRuntime) => runtime.mailDelivery,
            inject: [BETTER_AUTH_RUNTIME],
        },
        {
            provide: NATIVE_HUMAN_USER_PROVISIONER,
            useFactory: (runtime: BetterAuthRuntime) => runtime.provisioner,
            inject: [BETTER_AUTH_RUNTIME],
        },
        BetterAuthRuntimeLifecycle,
    ],
    exports: [BETTER_AUTH_RUNTIME, AUTH_MAIL_DELIVERY, NATIVE_HUMAN_USER_PROVISIONER],
})
export class BetterAuthRuntimeModule {}
