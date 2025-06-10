import { Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { join } from 'node:path'

@Module({
    imports: [
        ClientsModule.register([
            {
                name: 'API_KEY_PACKAGE',
                transport: Transport.GRPC,
                options: {
                    package: 'api_key',
                    protoPath: join(__dirname, 'api_key.proto'),
                    url: 'api-key:5000',
                },
            },
        ]),
    ],
    exports: [ClientsModule],
})
export class KeyModule {}
