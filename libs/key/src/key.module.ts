import { Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { join } from 'node:path'
import { env } from 'process'
import { ConfigModule, ConfigService } from '@nestjs/config'

@Module({
    imports: [
        ClientsModule.registerAsync({
            clients: [
                {
                    name: 'API_KEY_PACKAGE',
                    imports: [ConfigModule],
                    useFactory: (configService: ConfigService) => ({
                        transport: Transport.GRPC,
                        options: {
                            package: 'api_key',
                            protoPath: env.JEST_WORKER_ID
                                ? join('proto', 'api_key.proto')
                                : join(__dirname, 'proto', 'api_key.proto'),
                            url: configService.get<string>('APIKEY_URL'),
                        },
                    }),
                    inject: [ConfigService],
                },
            ],
        }),
    ],
    exports: [ClientsModule],
})
export class KeyModule {}
