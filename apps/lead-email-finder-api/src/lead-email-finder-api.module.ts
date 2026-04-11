import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AutomapperModule } from '@automapper/nestjs'
import { classes } from '@automapper/classes'
import { LoggerModule } from 'pino-nestjs'
import { EmailVerificationModule } from './email-verification-module'
import { BullModule } from '@nestjs/bullmq'
import { Redis } from 'ioredis'
import { HealthModule } from './health'
import { env } from 'node:process'
import { S3Module } from 'nestjs-s3'
import { S3ModuleOptionsFactoryImpl } from './s3-module-options-factory-impl'
import { Environment, loadSecrets, validate } from '@tuposoft/lead-email-finder/config'
import { EnvironmentVariablesDto } from './environment-variables.dto'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [loadSecrets],
            validate: config => validate(EnvironmentVariablesDto, config),
            cache: env.NODE_ENV === Environment.Production,
        }),
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                uri: configService.get('MONGO_URL'),
            }),
            inject: [ConfigService],
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                url: configService.get('POSTGRES_URL'),
                entities: [],
                synchronize: false,
            }),
            inject: [ConfigService],
        }),
        AutomapperModule.forRoot({
            strategyInitializer: classes(),
        }),
        LoggerModule.forRoot(),
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
})
export class LeadEmailFinderApiModule {}
