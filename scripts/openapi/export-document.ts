import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { denyNetwork } from './deny-network'
import { installPreviewEnvironment } from './preview-environment'
import type { ApiDocuments, PluginMetadataFactory } from '../../src/lead-email-finder-api/src/openapi/api-document'

async function exportDocument(): Promise<void> {
    const [outputDirectory] = process.argv.slice(2)
    if (!outputDirectory) throw new Error('An export output directory is required')
    installPreviewEnvironment()
    // Fail immediately if a module import or a future preview change attempts network I/O.
    denyNetwork()

    const { generateMetadata } = await import('../../src/lead-email-finder-api/src/generate-metadata')
    generateMetadata(outputDirectory)
    const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }
    // ConfigModule's default dotenv lookup now sees only the isolated output directory.
    process.chdir(outputDirectory)
    const { NestFactory } = await import('@nestjs/core')
    const { Module, Injectable } = await import('@nestjs/common')
    const { LeadEmailFinderApiModule } = await import(
        '../../src/lead-email-finder-api/src/lead-email-finder-api.module'
    )
    const { configureApiSerialization } = await import(
        '../../src/lead-email-finder-api/src/configure-api-serialization'
    )
    const { buildApiDocuments } = await import('../../src/lead-email-finder-api/src/openapi/api-document')
    // A permanent canary catches accidental removal of preview mode before infrastructure factories run.
    @Injectable()
    class MetadataLifecycleCanary {
        constructor() {
            throw new Error('Providers must not be instantiated during OpenAPI export')
        }
        onModuleInit(): never {
            throw new Error('Lifecycle hooks must not run during OpenAPI export')
        }
    }
    @Module({ imports: [LeadEmailFinderApiModule], providers: [MetadataLifecycleCanary] })
    class MetadataApplication {}
    const app = await NestFactory.create(MetadataApplication, { preview: true, logger: false, abortOnError: false })
    try {
        configureApiSerialization(app)
        const { default: metadata } = (await import(resolve(outputDirectory, 'metadata.ts'))) as {
            default: PluginMetadataFactory
        }
        const documents: ApiDocuments = await buildApiDocuments(app, metadata, { url: process.env.API_URL!, version })
        writeFileSync(resolve(outputDirectory, 'browser.json'), `${JSON.stringify(documents.browser, null, 2)}\n`)
        writeFileSync(resolve(outputDirectory, 'runtime.json'), `${JSON.stringify(documents.runtime, null, 2)}\n`)
    } finally {
        await app.close()
    }
}

void exportDocument().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'OpenAPI export failed')
    process.exitCode = 1
})
