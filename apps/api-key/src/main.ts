import { NestFactory, Reflector } from '@nestjs/core'
import { ApiKeyModule } from './api-key.module'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { join } from 'node:path'
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { Logger } from 'pino-nestjs'
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check'
import { Server } from '@grpc/grpc-js'

async function bootstrap(): Promise<void> {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(ApiKeyModule, {
        transport: Transport.GRPC,
        options: {
            package: 'api_key',
            protoPath: [healthCheckProtoPath, join(__dirname, 'proto', 'api_key.proto')],
            url: '0.0.0.0:5000',
            onLoadPackageDefinition: (_pkg, server: Server) => {
                const healthImpl = new HealthImplementation({
                    '': 'UNKNOWN',
                })

                healthImpl.addToServer(server)
                healthImpl.setStatus('', 'SERVING')
            },
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
