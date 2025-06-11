import { Module } from '@nestjs/common'
import { ApiKeyController } from './api-key.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { ApiKeySchema, Key } from './api-key.schema'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ApiKeyService } from './api-key.service'
import { loadSecrets } from '@tuposoft/lead-email-finder/config'
import { env } from 'node:process'
import { LoggerModule } from 'pino-nestjs'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [loadSecrets],
            cache: env.NODE_ENV === 'production',
        }),
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                uri: configService.get('APIKEY_MONGO_URL'),
            }),
            inject: [ConfigService],
        }),
        MongooseModule.forFeature([{ name: Key.name, schema: ApiKeySchema }]),
        LoggerModule.forRoot(),
    ],
    controllers: [ApiKeyController],
    providers: [ApiKeyService],
})
export class ApiKeyModule {}
