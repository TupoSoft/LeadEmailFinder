import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { AutomapperModule } from '@automapper/nestjs'
import { classes } from '@automapper/classes'
import { LoggerModule } from 'pino-nestjs'
import { EmailVerificationModule } from './email-verification-module'
import { BullModule } from '@nestjs/bullmq'
import { Redis } from 'ioredis'
import { ApiKeyGuard, KeyModule } from '@tuposoft/lead-email-finder/key'
import { HealthModule } from './health'
import { validate } from './config'
import { env } from 'node:process'
import { APP_GUARD } from '@nestjs/core'
import { S3Module } from 'nestjs-s3'
import { S3ModuleOptionsFactoryImpl } from './s3-module-options-factory-impl'
import { loadSecrets } from '@tuposoft/lead-email-finder/config'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [loadSecrets],
            validate,
            cache: env.NODE_ENV === 'production',
        }),
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                uri: configService.get('MONGO_URL'),
            }),
            inject: [ConfigService],
        }),
        AutomapperModule.forRoot({
            strategyInitializer: classes(),
        }),
        LoggerModule.forRoot(),
        KeyModule,
        BullModule.forRootAsync({
            useFactory: (connection: Redis) => ({
                connection,
            }),
            inject: [Redis],
        }),
        EmailVerificationModule,
        HealthModule,
        S3Module.forRootAsync({
            imports: [ConfigModule],
            useClass: S3ModuleOptionsFactoryImpl,
        }),
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ApiKeyGuard,
        },
    ],
})
export class LeadEmailFinderApiModule {}
