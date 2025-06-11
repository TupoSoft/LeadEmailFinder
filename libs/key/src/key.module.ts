import { Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { join } from 'node:path'
import { env } from 'process'

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'API_KEY_PACKAGE',
                transport: Transport.GRPC,
                options: {
                    package: 'api_key',
                    protoPath: env.JEST_WORKER_ID
                        ? join('proto', 'api_key.proto')
                        : join(__dirname, 'proto', 'api_key.proto'),
                    url: 'api-key:5000',
                },
            },
        ]),
    ],
    exports: [ClientsModule],
})
export class KeyModule {}
