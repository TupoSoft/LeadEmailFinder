import { NestFactory, Reflector } from '@nestjs/core'
import { AppModule } from './app.module'
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ConfigService } from '@nestjs/config'
import { Logger } from 'pino-nestjs'
import metadata from './metadata'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)
    app.useLogger(app.get(Logger))
    app.useGlobalPipes(new ValidationPipe())
    app.useGlobalInterceptors(
        new ClassSerializerInterceptor(app.get(Reflector), {
            strategy: 'excludeAll',
        }),
    )

    const configService: ConfigService<unknown, true> = app.get(ConfigService)
    const url = configService.get<string>('API_URL')
    const version = configService.get<string>('npm_package_version')

    const documentBuilder = new DocumentBuilder()
    documentBuilder.setTitle('Lead Email Finder API')
    documentBuilder.setVersion(version)
    documentBuilder.setContact('Lead Email Finder Support', url, 'contact@leademailfinder.com')
    documentBuilder.addServer(url, 'Production server')
    documentBuilder.addBearerAuth()

    const config = documentBuilder.build()

    await SwaggerModule.loadPluginMetadata(metadata)
    const documentFactory = () => SwaggerModule.createDocument(app, config)

    SwaggerModule.setup('/', app, documentFactory)

    await app.listen(process.env.PORT ?? 3000)
}

void bootstrap()
