import { NestFactory } from '@nestjs/core'
import { ApiKeyModule } from './api-key.module'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { join } from 'node:path'

async function bootstrap() {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(ApiKeyModule, {
        transport: Transport.GRPC,
        options: {
            package: 'api_key',
            protoPath: join(__dirname, 'api_key.proto'),
        },
    })

    await app.listen()
}

void bootstrap()
