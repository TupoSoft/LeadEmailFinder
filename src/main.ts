import { NestFactory } from '@nestjs/core'
import { LeadEmailFinderApiModule } from './lead-email-finder-api/src/lead-email-finder-api.module'
import { ConfigService } from '@nestjs/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Logger } from 'pino-nestjs'
import { NestExpressApplication } from '@nestjs/platform-express'
import { configurePiiSafeRequestLogging } from './lead-email-finder-api/src/configure-pii-safe-request-logging'
import { configureApiSerialization } from './lead-email-finder-api/src/configure-api-serialization'
import {
    buildApiDocuments,
    PluginMetadataFactory,
    registerApiDocumentation,
} from './lead-email-finder-api/src/openapi/api-document'

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(LeadEmailFinderApiModule, { rawBody: true })
    configurePiiSafeRequestLogging(app)
    app.disable('x-powered-by')
    app.enable('trust proxy')
    app.useLogger(app.get(Logger))
    configureApiSerialization(app)

    const configService: ConfigService<unknown, true> = app.get(ConfigService)
    const url = configService.get<string>('API_URL')
    const { version } = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as {
        version: string
    }

    // Nest's SWC build creates this module before starting the application.
    const metadataPath = './metadata'
    const { default: metadata } = (await import(metadataPath)) as { default: PluginMetadataFactory }
    registerApiDocumentation(app, await buildApiDocuments(app, metadata, { url, version }))

    await app.listen(process.env.port ?? 3000)
}

void bootstrap()
