import { Module } from '@nestjs/common'
import { ApiKeyController } from './api-key.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { EnvironmentVariablesDto } from '@tuposoft/lead-email-finder/modules/api-key'
import { Environment, loadSecrets, validate } from '@tuposoft/lead-email-finder/config'
import { env } from 'node:process'
import { LoggerModule } from 'pino-nestjs'
import { ApiKeyModule as ApiKeyInternalModule } from '@tuposoft/lead-email-finder/modules/api-key'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [loadSecrets],
            validate: config => validate(EnvironmentVariablesDto, config),
            cache: env.NODE_ENV === Environment.Production,
        }),
        MongooseModule.forRootAsync({
            connectionName: 'api-key',
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                uri: configService.get('APIKEY_MONGO_URL'),
            }),
            inject: [ConfigService],
        }),
        ApiKeyInternalModule,
        LoggerModule.forRoot(),
    ],
    controllers: [ApiKeyController],
})
export class ApiKeyModule {}
