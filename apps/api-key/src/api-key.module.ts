import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { loadSecrets } from '@tuposoft/lead-email-finder/config'
import { env } from 'node:process'
import { LoggerModule } from 'pino-nestjs'

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [loadSecrets],
            cache: env.NODE_ENV === 'production',
        }),
        LoggerModule.forRoot(),
    ],
    controllers: [],
    providers: [],
})
export class ApiKeyModule {}
