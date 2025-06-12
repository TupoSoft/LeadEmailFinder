import { Module } from '@nestjs/common'
import { ApiKeyController } from './api-key.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { ApiKeySchema, Key } from './api-key.schema'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ApiKeyService } from './api-key.service'
import { Environment, loadSecrets, validate } from '@tuposoft/lead-email-finder/config'
import { env } from 'node:process'
import { LoggerModule } from 'pino-nestjs'
import { EnvironmentVariablesDto } from './environment-variables.dto'

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
        MongooseModule.forFeature([{ name: Key.name, schema: ApiKeySchema }], 'api-key'),
        LoggerModule.forRoot(),
    ],
    controllers: [ApiKeyController],
    providers: [ApiKeyService],
})
export class ApiKeyModule {}
