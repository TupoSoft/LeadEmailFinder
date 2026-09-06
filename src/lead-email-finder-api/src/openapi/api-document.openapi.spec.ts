import { INestApplication, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildApiDocuments, registerApiDocumentation } from './api-document'

@Module({})
class DocumentationTestModule {}

describe('API documentation routes', () => {
    let app: INestApplication
    const browser = JSON.parse(
        readFileSync(resolve('packages/api-client/openapi/lead-email-finder.json'), 'utf8'),
    ) as OpenAPIObject

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [DocumentationTestModule] }).compile()
        app = moduleRef.createNestApplication({ logger: false })
        const runtime = structuredClone(browser)
        runtime.paths['/v1/excluded-runtime-only'] = { get: { responses: { '200': { description: 'Runtime only' } } } }
        registerApiDocumentation(app, { runtime, browser })
        await app.init()
    })
    afterAll(async () => {
        await app.close()
    })

    it('serves HTML at /docs and normalized browser JSON at /openapi.json', async () => {
        const docs = await request(app.getHttpServer()).get('/docs').expect(200).expect('Content-Type', /html/)
        expect(docs.text).toContain('swagger-ui')
        const json = await request(app.getHttpServer()).get('/openapi.json').expect(200).expect('Content-Type', /json/)
        expect(json.body).toEqual(browser)
        const configuration = await request(app.getHttpServer()).get('/docs/swagger-ui-init.js').expect(200)
        expect(configuration.text).toContain('/v1/excluded-runtime-only')
        expect(configuration.text).toMatch(/"servers":\s*\[\s*\{\s*"url":\s*"\/"/u)
        expect((json.body as OpenAPIObject).paths).not.toHaveProperty('/v1/excluded-runtime-only')
    })

    it('builds the runtime server relative to the serving origin regardless of API_URL', async () => {
        const createDocument = jest.spyOn(SwaggerModule, 'createDocument').mockReturnValue(structuredClone(browser))
        const metadata = jest.spyOn(SwaggerModule, 'loadPluginMetadata').mockResolvedValue(undefined)
        try {
            const documents = await buildApiDocuments(app, () => Promise.resolve({}), {
                url: 'http://api:3000',
                version: 'test',
            })

            expect(createDocument).toHaveBeenCalledWith(app, expect.objectContaining({
                servers: [{ url: '/', description: 'API server' }],
            }))
            expect(documents.browser).toEqual(browser)
        } finally {
            createDocument.mockRestore()
            metadata.mockRestore()
        }
    })

    it.each(['/', '/docs-json', '/docs-yaml'])('does not register %s', async path => {
        await request(app.getHttpServer()).get(path).expect(404)
    })
})
