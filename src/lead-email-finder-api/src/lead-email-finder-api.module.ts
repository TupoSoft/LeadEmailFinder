import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AutomapperModule } from '@automapper/nestjs'
import { classes } from '@automapper/classes'
import { LoggerModule } from 'pino-nestjs'
import { EmailVerificationModule } from './email-verification-module'
import { BullModule } from '@nestjs/bullmq'
import { Redis } from 'ioredis'
import { HealthModule } from './health'
import { S3Module } from 'nestjs-s3'
import { S3ModuleOptionsFactoryImpl } from './s3-module-options-factory-impl'
import { loadSecrets, validate } from '@tuposoft/lead-email-finder/config'
import { EnvironmentVariablesDto } from './environment-variables.dto'
import { ProxyModule } from '../../proxy/src/proxy.module'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [loadSecrets],
            validate: config => validate(EnvironmentVariablesDto, config),
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                url: configService.get('POSTGRES_URL'),
                autoLoadEntities: true,
                synchronize: configService.get('TYPEORM_SYNCHRONIZE'),
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
        IdentityModule,
        ProxyModule,
        HealthModule,
        S3Module.forRootAsync({
            imports: [ConfigModule],
            useClass: S3ModuleOptionsFactoryImpl,
        }),
    ],
})
export class LeadEmailFinderApiModule {}
