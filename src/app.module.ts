import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { EmailModule } from './email-module'
import secrets from './config/secrets.config'
import { AutomapperModule } from '@automapper/nestjs'
import { classes } from '@automapper/classes'
import { ParseConnectionStringOptionsFactory, RedisModule } from './redis'
import { LoggerModule } from 'pino-nestjs'
import { DomainModule } from './domain-module'
import { SmtpModule } from './smtp-module'
import { CatchAllModule } from './catch-all'
import { EmailVerificationModule } from './email-verification-module'

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
        DomainModule,
        EmailModule,
        SmtpModule,
        CatchAllModule,
        EmailVerificationModule,
    ],
})
export class AppModule {}
