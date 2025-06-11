import { NestFactory, Reflector } from '@nestjs/core'
import { ApiKeyModule } from './api-key.module'
import { MicroserviceOptions, RpcException, Transport } from '@nestjs/microservices'
import { join } from 'node:path'
import { Logger } from 'pino-nestjs'
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'

async function bootstrap() {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(ApiKeyModule, {
        transport: Transport.GRPC,
        options: {
            package: 'api_key',
            protoPath: join(__dirname, 'api_key.proto'),
            url: '0.0.0.0:5000',
        },
    })

    app.useLogger(app.get(Logger))
    app.useGlobalPipes(
        new ValidationPipe({
            exceptionFactory: errors => new RpcException(errors),
            whitelist: true,
            transform: true,
            forbidNonWhitelisted: true,
            forbidUnknownValues: true,
        }),
    )
    app.useGlobalInterceptors(
        new ClassSerializerInterceptor(app.get(Reflector), {
            strategy: 'excludeAll',
            enableImplicitConversion: true,
        }),
    )

    await app.listen()
}

void bootstrap()
