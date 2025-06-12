import { NestFactory, Reflector } from '@nestjs/core'
import { ApiKeyModule } from './api-key.module'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { join } from 'node:path'
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { Logger } from 'pino-nestjs'

async function bootstrap(): Promise<void> {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(ApiKeyModule, {
        transport: Transport.GRPC,
        options: {
            package: 'api_key',
            protoPath: join(__dirname, 'proto', 'api_key.proto'),
            url: '0.0.0.0:5000',
        },
    })

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
            forbidUnknownValues: true,
        }),
    ).useGlobalInterceptors(
        new ClassSerializerInterceptor(app.get(Reflector), {
            strategy: 'excludeAll',
            enableImplicitConversion: true,
        }),
    )

    app.useLogger(app.get(Logger))

    await app.listen()
}

void bootstrap()
