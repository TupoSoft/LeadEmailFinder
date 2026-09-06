import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

export function configureApiSerialization(app: INestApplication): void {
    app.useGlobalPipes(new ValidationPipe())
    app.useGlobalInterceptors(
        new ClassSerializerInterceptor(new Reflector(), {
            strategy: 'excludeAll',
            enableImplicitConversion: true,
        }),
    )
}
