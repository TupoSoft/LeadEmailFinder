import { NestFactory, Reflector } from '@nestjs/core'
import { LeadEmailFinderApiModule } from './lead-email-finder-api/src/lead-email-finder-api.module'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger } from 'pino-nestjs'
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { configurePiiSafeRequestLogging } from './lead-email-finder-api/src/configure-pii-safe-request-logging'
import { BFF_SESSION_COOKIE_NAME } from '@tuposoft/lead-email-finder/modules/auth'

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(LeadEmailFinderApiModule, { rawBody: true })
    configurePiiSafeRequestLogging(app)
    app.disable('x-powered-by')
    app.enable('trust proxy')
    app.useLogger(app.get(Logger))
    app.useGlobalPipes(new ValidationPipe())
    app.useGlobalInterceptors(
        new ClassSerializerInterceptor(app.get(Reflector), {
            strategy: 'excludeAll',
            enableImplicitConversion: true,
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
    documentBuilder.addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'oidc')
    documentBuilder.addCookieAuth(BFF_SESSION_COOKIE_NAME, { type: 'apiKey' }, BFF_SESSION_COOKIE_NAME)

    const config = documentBuilder.build()

    const documentFactory = (): ReturnType<typeof SwaggerModule.createDocument> =>
        SwaggerModule.createDocument(app, config)

    SwaggerModule.setup('/', app, documentFactory)

    await app.listen(process.env.port ?? 3000)
}

void bootstrap()
