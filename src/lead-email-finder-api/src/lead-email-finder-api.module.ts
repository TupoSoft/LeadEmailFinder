import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AutomapperModule } from '@automapper/nestjs'
import { classes } from '@automapper/classes'
import { LoggerModule } from 'pino-nestjs'
import { EmailVerificationModule } from '@tuposoft/lead-email-finder/modules/email-verification'
import { BullModule } from '@nestjs/bullmq'
import { Redis } from 'ioredis'
import { HealthModule } from './health'
import { S3Module } from 'nestjs-s3'
import { S3ModuleOptionsFactoryImpl } from './s3-module-options-factory-impl'
import { loadSecrets, validate } from '@tuposoft/lead-email-finder/config'
import { EnvironmentVariablesDto, normalizeEnvironmentConfiguration } from './environment-variables.dto'
import { ProxyModule } from '@tuposoft/lead-email-finder/modules/proxy'
import { IdentityModule } from '@tuposoft/lead-email-finder/modules/identity'
import { PaymentsModule } from '@tuposoft/lead-email-finder/modules/payments'
import { OrganizationOnboardingModule } from '@tuposoft/lead-email-finder/modules/organization-onboarding'
import { ServiceClientManagementModule } from '@tuposoft/lead-email-finder/modules/service-client-management'
import { AuthenticationCompositionModule } from './authentication/authentication-composition.module'
import { PostgresModuleOptionsFactoryImpl } from './postgres-module-options-factory-impl'
import { CustomerObjectWriteSecurityModule } from './customer-object-write-security.module'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [loadSecrets],
            validate: config => validate(EnvironmentVariablesDto, normalizeEnvironmentConfiguration(config)),
        }),
        CustomerObjectWriteSecurityModule,
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            useClass: PostgresModuleOptionsFactoryImpl,
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
        AuthenticationCompositionModule,
        OrganizationOnboardingModule,
        ServiceClientManagementModule,
        PaymentsModule,
        ProxyModule,
        HealthModule,
        S3Module.forRootAsync({
            imports: [ConfigModule],
            useClass: S3ModuleOptionsFactoryImpl,
        }),
    ],
})
export class LeadEmailFinderApiModule {}
