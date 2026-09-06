import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import { BFF_SESSION_COOKIE_NAME } from '@tuposoft/lead-email-finder/modules/auth'
import { buildBrowserDocument } from './browser-document'

export type PluginMetadataFactory = Parameters<typeof SwaggerModule.loadPluginMetadata>[0]

export interface ApiDocuments {
    runtime: OpenAPIObject
    browser: OpenAPIObject
}

export async function buildApiDocuments(
    app: INestApplication,
    metadata: PluginMetadataFactory,
    { url, version }: { url: string; version: string },
): Promise<ApiDocuments> {
    await SwaggerModule.loadPluginMetadata(metadata)
    const configuration = new DocumentBuilder()
        .setTitle('Lead Email Finder API')
        .setVersion(version)
        .setContact('Lead Email Finder Support', url, 'contact@leademailfinder.com')
        .addServer(url, 'API server')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'oidc')
        .addCookieAuth(BFF_SESSION_COOKIE_NAME, { type: 'apiKey' }, BFF_SESSION_COOKIE_NAME)
        .addSecurity('x-csrf-token', {
            type: 'apiKey',
            in: 'header',
            name: 'x-csrf-token',
            description:
                'The decoded lef_csrf_token cookie value, supplied by the browser transport on unsafe methods.',
        })
        .build()
    const runtime = SwaggerModule.createDocument(app, configuration)
    return { runtime, browser: buildBrowserDocument(runtime) }
}

export function registerApiDocumentation(app: INestApplication, documents: ApiDocuments): void {
    SwaggerModule.setup('/docs', app, documents.runtime, { raw: false })
    app.getHttpAdapter().get('/openapi.json', (_request: unknown, response: unknown) => {
        app.getHttpAdapter().reply(response, documents.browser, 200)
    })
}
