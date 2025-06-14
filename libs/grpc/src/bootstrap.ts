import { NestFactory, Reflector } from '@nestjs/core'
import { ClassSerializerInterceptor, DynamicModule, ForwardReference, Type, ValidationPipe } from '@nestjs/common'
import { MicroserviceOptions, Transport } from '@nestjs/microservices'
import { HealthImplementation, protoPath as healthCheckProtoPath } from 'grpc-health-check'
import { join } from 'node:path'
import { Server } from '@grpc/grpc-js'
import { Logger } from 'pino-nestjs'

type IEntryNestModule = Type | DynamicModule | ForwardReference | Promise<IEntryNestModule>

interface BootstrapParams {
    module: IEntryNestModule
    protoPackage: string
}

export async function bootstrap({ module, protoPackage }: BootstrapParams): Promise<void> {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(module, {
        transport: Transport.GRPC,
        options: {
            package: protoPackage,
            protoPath: [healthCheckProtoPath, join(__dirname, 'proto', `${protoPackage}.proto`)],
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
