import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import secrets from './config/secrets.config'
import { AutomapperModule } from '@automapper/nestjs'
import { classes } from '@automapper/classes'
import { ParseConnectionStringOptionsFactory, RedisModule } from './redis'
import { LoggerModule } from 'pino-nestjs'
import { EmailVerificationModule } from './email-verification-module'
import { BullModule } from '@nestjs/bullmq'
import { Redis } from 'ioredis'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [secrets],
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
        RedisModule.forRootAsync({
            imports: [ConfigModule],
            useClass: ParseConnectionStringOptionsFactory,
        }),
        LoggerModule.forRoot(),
        BullModule.forRootAsync({
            useFactory: (connection: Redis) => ({
                connection,
            }),
            inject: [Redis],
        }),
        EmailVerificationModule,
    ],
})
export class AppModule {}
