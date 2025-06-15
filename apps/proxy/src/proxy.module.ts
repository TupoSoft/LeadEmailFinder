import { Module } from '@nestjs/common'
import { LoggerModule } from 'pino-nestjs'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { Environment, loadSecrets, validate } from '@tuposoft/lead-email-finder/config'
import { env } from 'node:process'
import { EnvDto } from './env.dto'
import { MongooseModule } from '@nestjs/mongoose'

@Module({
    imports: [
        LoggerModule.forRoot(),
        ConfigModule.forRoot({
            load: [loadSecrets],
            validate: config => validate(EnvDto, config),
            cache: env.NODE_ENV === Environment.Production,
        }),
        MongooseModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                uri: configService.get('MONGO_URL'),
            }),
            inject: [ConfigService],
        }),
    ],
})
export class ProxyModule {}
