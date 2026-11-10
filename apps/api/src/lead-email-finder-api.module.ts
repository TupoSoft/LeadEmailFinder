import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { LoggerModule } from 'pino-nestjs'
import { EmailVerificationModule } from '@tuposoft/lead-email-finder/modules/email-verification'
import { BullModule } from '@nestjs/bullmq'
import { Redis } from 'ioredis'
import { ParseConnectionStringOptionsFactory, RedisModule } from '@tuposoft/lead-email-finder/redis'
import { HealthModule } from './health'
import { S3Module } from 'nestjs-s3'
import { S3ModuleOptionsFactoryImpl } from './s3-module-options-factory-impl'
import { loadSecrets, validate } from '@tuposoft/lead-email-finder/config'
import { EnvironmentVariablesDto, normalizeEnvironmentConfiguration } from './environment-variables.dto'
import { ProxyModule } from '@tuposoft/lead-email-finder/modules/proxy'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { AuthenticationCompositionModule } from './authentication/authentication-composition.module'
import { PostgresModuleOptionsFactoryImpl } from './postgres-module-options-factory-impl'
import { CustomerObjectWriteSecurityModule } from './customer-object-write-security.module'
import { createPiiSafePinoHttpOptions } from './pii-safe-logger-options'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [loadSecrets],
            validate: config => validate(EnvironmentVariablesDto, normalizeEnvironmentConfiguration(config)),
        }),
        CustomerObjectWriteSecurityModule,
        RedisModule.forRootAsync({
            imports: [ConfigModule],
            useClass: ParseConnectionStringOptionsFactory,
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            useClass: PostgresModuleOptionsFactoryImpl,
        }),
        LoggerModule.forRoot({ useExisting: true, pinoHttp: createPiiSafePinoHttpOptions() }),
        BullModule.forRootAsync({
            useFactory: (connection: Redis) => ({
                connection,
            }),
            inject: [Redis],
        }),
        EmailVerificationModule,
        IdentityModule,
        AuthenticationCompositionModule,
        ProxyModule,
        HealthModule,
        S3Module.forRootAsync({
            imports: [ConfigModule],
            useClass: S3ModuleOptionsFactoryImpl,
        }),
    ],
})
export class LeadEmailFinderApiModule {}
