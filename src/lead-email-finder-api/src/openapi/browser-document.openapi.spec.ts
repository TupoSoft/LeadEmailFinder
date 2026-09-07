import type { OpenAPIObject } from '@nestjs/swagger'
import { execFileSync } from 'node:child_process'
import { BROWSER_OPERATIONS, buildBrowserDocument } from './browser-document'

function fixture(): OpenAPIObject {
    return {
        openapi: '3.0.0',
        info: { title: 'Browser filter fixture', version: '1' },
        paths: BROWSER_OPERATIONS.reduce<OpenAPIObject['paths']>((paths, { path, method }) => {
            paths[path] ??= {}
            paths[path][method] = { responses: { '200': { description: 'Success' } } }
            return paths
        }, {}),
    }
}

describe('browser OpenAPI boundary', () => {
    it('keeps exactly the checked path/method pairs and leaves the runtime document unchanged', () => {
        const full = fixture()
        full.paths['/v1/auth/session'].post = {
            responses: {
                '200': {
                    description: 'Internal operation',
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/SharedPathSentinel' } },
                    },
                },
            },
        }
        for (const name of ['PaymentSentinel', 'VerificationSentinel', 'ProxySentinel']) {
            full.paths[`/internal/${name}`] = {
                post: {
                    tags: ['Internal'],
                    responses: {
                        '200': {
                            description: 'Excluded',
                            content: {
                                'application/json': { schema: { $ref: `#/components/schemas/${name}` } },
                            },
                        },
                    },
                },
            }
        }
        full.components = {
            schemas: Object.fromEntries(
                ['PaymentSentinel', 'VerificationSentinel', 'ProxySentinel', 'SharedPathSentinel'].map(name => [
                    name,
                    { type: 'object' },
                ]),
            ),
        }
        full.tags = [{ name: 'Browser' }, { name: 'Internal' }]
        full.paths['/health'].get!.tags = ['Browser']
        Object.assign(full, { webhooks: { unlisted: { post: { responses: {} } } } })
        const original = structuredClone(full)

        const browser = buildBrowserDocument(full)

        expect(
            Object.entries(browser.paths)
                .flatMap(([path, item]) =>
                    Object.keys(item)
                        .filter(method => ['get', 'post'].includes(method))
                        .map(method => `${method} ${path}`),
                )
                .sort(),
        ).toEqual(BROWSER_OPERATIONS.map(({ path, method }) => `${method} ${path}`).sort())
        expect(browser.components).toEqual({})
        expect(browser.tags).toEqual([{ name: 'Browser' }])
        expect(browser).not.toHaveProperty('webhooks')
        expect(JSON.stringify(browser)).not.toMatch(
            /PaymentSentinel|VerificationSentinel|ProxySentinel|SharedPathSentinel/,
        )
        expect(full).toEqual(original)
    })

    it.each(BROWSER_OPERATIONS)('fails if required $method $path is absent', ({ path, method }) => {
        const full = fixture()
        delete full.paths[path][method]
        expect(() => buildBrowserDocument(full)).toThrow(
            `Missing required browser operation: ${method.toUpperCase()} ${path}`,
        )
    })

    it('excludes sentinel schemas from generated TypeScript while retaining the browser response type', () => {
        const full = fixture()
        full.paths['/health'].get!.responses['200'] = {
            description: 'Browser',
            content: {
                'application/json': { schema: { $ref: '#/components/schemas/BrowserResponse' } },
            },
        }
        const sentinels = ['PaymentSentinel', 'VerificationSentinel', 'ProxySentinel']
        for (const name of sentinels) {
            full.paths[`/internal/${name}`] = {
                post: {
                    responses: {
                        '200': {
                            description: 'Excluded',
                            content: {
                                'application/json': { schema: { $ref: `#/components/schemas/${name}` } },
                            },
                        },
                    },
                },
            }
        }
        full.components = {
            schemas: Object.fromEntries(
                ['BrowserResponse', ...sentinels].map(name => [
                    name,
                    {
                        type: 'object',
                        properties: { value: { type: 'string' } },
                    },
                ]),
            ),
        }
        const generated = execFileSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                `
            import openapiTS, { astToString } from 'openapi-typescript';
            import { readFileSync } from 'node:fs';
            process.stdout.write(astToString(await openapiTS(JSON.parse(readFileSync(0, 'utf8')))));
        `,
            ],
            { input: JSON.stringify(buildBrowserDocument(full)), encoding: 'utf8' },
        )

        expect(generated).toContain('BrowserResponse')
        for (const name of sentinels) expect(generated).not.toContain(name)
    })

    it('retains every reachable component kind across parameters, bodies, responses, callbacks, and links', () => {
        const full = fixture()
        full.paths['/v1/auth/session'].parameters = [{ $ref: '#/components/parameters/PathParameter' }]
        full.paths['/v1/auth/session'].get = {
            parameters: [{ $ref: '#/components/parameters/OperationParameter' }],
            requestBody: { $ref: '#/components/requestBodies/Body' },
            responses: { '200': { $ref: '#/components/responses/Response' } },
            callbacks: { callback: { $ref: '#/components/callbacks/Callback' } },
        }
        full.components = {
            parameters: {
                PathParameter: { in: 'query', name: 'path', schema: { $ref: '#/components/schemas/ParameterSchema' } },
                OperationParameter: {
                    in: 'query',
                    name: 'operation',
                    examples: { sample: { $ref: '#/components/examples/Example' } },
                },
                Unused: { in: 'query', name: 'unused' },
            },
            requestBodies: {
                Body: {
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/BodySchema' },
                            encoding: { field: { headers: { h: { $ref: '#/components/headers/EncodingHeader' } } } },
                        },
                    },
                },
                Unused: { content: {} },
            },
            responses: {
                Response: {
                    description: 'Response',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/ResponseSchema' } } },
                    headers: { h: { $ref: '#/components/headers/ResponseHeader' } },
                    links: { next: { $ref: '#/components/links/Link' } },
                },
                Unused: { description: 'Unused' },
            },
            headers: {
                EncodingHeader: { schema: { type: 'string' } },
                ResponseHeader: {
                    content: {
                        'application/json': { examples: { sample: { $ref: '#/components/examples/Example' } } },
                    },
                },
                Unused: { schema: { type: 'string' } },
            },
            examples: { Example: { value: { example: 'Kept' } }, Unused: { value: 'Unused' } },
            links: {
                Link: { operationRef: '#/paths/~1health/get' },
                Unused: { operationId: 'unused' },
            },
            callbacks: {
                Callback: {
                    '{$request.body#/url}': {
                        post: {
                            security: [{ CallbackAuth: [] }],
                            responses: {
                                '200': {
                                    description: 'Callback',
                                    content: {
                                        'application/json': { schema: { $ref: '#/components/schemas/CallbackSchema' } },
                                    },
                                },
                            },
                        },
                    },
                },
                Unused: {},
            },
            schemas: Object.fromEntries(
                ['ParameterSchema', 'BodySchema', 'ResponseSchema', 'CallbackSchema', 'Unused'].map(name => [
                    name,
                    { type: 'string' },
                ]),
            ),
            securitySchemes: {
                CallbackAuth: { type: 'http', scheme: 'bearer' },
                Unused: { type: 'http', scheme: 'bearer' },
            },
        }

        const browser = buildBrowserDocument(full)

        expect(Object.keys(browser.components!)).toEqual(Object.keys(full.components).sort())
        for (const category of Object.values(browser.components!)) expect(category).not.toHaveProperty('Unused')
        expect(browser.components!.schemas).toEqual({
            BodySchema: { type: 'string' },
            CallbackSchema: { type: 'string' },
            ParameterSchema: { type: 'string' },
            ResponseSchema: { type: 'string' },
        })
        expect(browser.components!.securitySchemes).toEqual({ CallbackAuth: { type: 'http', scheme: 'bearer' } })
    })

    it('retains global and operation security schemes, including aliases, but excludes unused schemes', () => {
        const full = fixture()
        full.security = [{ Global: [] }]
        full.paths['/health'].get!.security = []
        full.paths['/v1/auth/session'].get!.security = [{ Cookie: [], 'Csrf/Token': [] }]
        full.components = {
            securitySchemes: {
                Global: { type: 'http', scheme: 'bearer' },
                Cookie: { $ref: '#/components/securitySchemes/CookieDefinition' },
                CookieDefinition: { type: 'apiKey', in: 'cookie', name: 'lef_session' },
                'Csrf/Token': { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
                Unused: { type: 'http', scheme: 'bearer' },
            },
        }

        const browser = buildBrowserDocument(full)

        expect(Object.keys(browser.components!.securitySchemes!)).toEqual([
            'Cookie',
            'CookieDefinition',
            'Csrf/Token',
            'Global',
        ])
        expect(browser.security).toEqual(full.security)
        expect(browser.paths['/health'].get!.security).toEqual([])
    })

    it('follows cyclic schemas, discriminator mappings, escaped pointers, and nested references', () => {
        const full = fixture()
        full.paths['/health'].get!.responses['200'] = {
            description: 'Cycle',
            content: {
                'application/json': { schema: { $ref: '#/components/schemas/Root' } },
            },
        }
        full.components = {
            schemas: {
                Root: {
                    oneOf: [{ $ref: '#/components/schemas/A' }],
                    discriminator: {
                        propertyName: 'kind',
                        mapping: { special: '#/components/schemas/Special~1Name~0', shorthand: 'Shorthand' },
                    },
                    properties: { nested: { $ref: '#/components/schemas/Container/properties/child' } },
                },
                A: { properties: { next: { $ref: '#/components/schemas/B' } } },
                B: { allOf: [{ $ref: '#/components/schemas/A' }] },
                'Special/Name~': { type: 'object' },
                Shorthand: { type: 'object' },
                Container: { properties: { child: { $ref: '#/components/schemas/Child' } } },
                Child: { type: 'string' },
                Unused: { type: 'string' },
            },
        }

        const browser = buildBrowserDocument(full)

        expect(Object.keys(browser.components!.schemas!)).toEqual([
            'A',
            'B',
            'Child',
            'Container',
            'Root',
            'Shorthand',
            'Special/Name~',
        ])
        expect(browser.components!.schemas!.A).toEqual(full.components.schemas!.A)
    })

    it.each(['#/components/schemas/Missing', '#/paths/~1excluded/get'])(
        'fails on unresolved retained reference %s',
        ref => {
            const full = fixture()
            full.paths['/health'].get!.responses['200'] = { $ref: ref }
            full.paths['/excluded'] = { get: { responses: {} } }
            expect(() => buildBrowserDocument(full)).toThrow(`Unresolved local OpenAPI reference: ${ref}`)
        },
    )

    it('fails for a missing security scheme and tolerates unresolved references only in excluded operations', () => {
        const full = fixture()
        full.paths['/excluded'] = { get: { responses: { '200': { $ref: '#/components/responses/Missing' } } } }
        expect(() => buildBrowserDocument(full)).not.toThrow()
        full.paths['/health'].get!.security = [{ Missing: [] }]
        expect(() => buildBrowserDocument(full)).toThrow(
            'Unresolved local OpenAPI reference: #/components/securitySchemes/Missing',
        )
    })

    it('rejects path references that could import operations outside the allow list', () => {
        const full = fixture()
        full.paths['/health'].$ref = '#/paths/~1excluded'
        expect(() => buildBrowserDocument(full)).toThrow('Browser paths must define operations inline: /health')
    })

    it('normalizes only OpenAPI servers, sorts objects deterministically, and preserves schema/example values', () => {
        const full = fixture()
        const payload = {
            servers: [{ url: 'https://example.invalid/data' }],
            $ref: '#/ordinary/data',
            security: [{ Data: [] }],
        }
        full.info.contact = { name: 'Support', url: 'https://environment.invalid' }
        full.servers = [{ url: 'https://environment.invalid', variables: { environment: { default: 'dev' } } }]
        full.paths['/health'].servers = [{ url: 'http://local.invalid' }]
        full.paths['/health'].get!.servers = [{ url: 'http://operation.invalid' }]
        full.paths['/health'].get!.responses['200'] = {
            description: 'Data',
            content: {
                'application/json': {
                    example: payload,
                    examples: { named: { value: payload } },
                    schema: {
                        type: 'object',
                        example: payload,
                        default: payload,
                        enum: [payload, null],
                        required: ['z', 'a'],
                        properties: { servers: { type: 'array', items: { type: 'string' } }, $ref: { type: 'string' } },
                    },
                },
            },
        }
        const original = structuredClone(full)

        const browser = buildBrowserDocument(full)

        expect(browser.servers).toEqual([{ url: '/' }])
        expect(browser.info.contact).toEqual({ name: 'Support', url: '/' })
        expect(browser.paths['/health'].servers).toEqual([{ url: '/' }])
        expect(browser.paths['/health'].get!.servers).toEqual([{ url: '/' }])
        expect(browser.paths['/health'].get!.responses).toEqual(full.paths['/health'].get!.responses)
        expect(full).toEqual(original)
        const reordered = {
            ...full,
            info: { version: '1', title: 'Browser filter fixture', contact: full.info.contact },
            paths: Object.fromEntries(Object.entries(full.paths).reverse()),
        }
        expect(JSON.stringify(browser)).toBe(JSON.stringify(buildBrowserDocument(reordered)))
        expect(buildBrowserDocument(browser)).toEqual(browser)
    })
})
