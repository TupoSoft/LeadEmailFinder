import type { OpenAPIObject } from '@nestjs/swagger'

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

export const BROWSER_OPERATIONS = [
    { path: '/v1/auth/login', method: 'get' },
    { path: '/v1/auth/callback', method: 'get' },
    { path: '/v1/auth/logout', method: 'post' },
    { path: '/v1/auth/session', method: 'get' },
    { path: '/v1/billing/summary', method: 'get' },
    { path: '/v1/billing/credit-packs', method: 'get' },
    { path: '/v1/credit-purchases', method: 'get' },
    { path: '/v1/credit-purchases', method: 'post' },
    { path: '/verifyAsync', method: 'post' },
    { path: '/verifyAsync/{id}', method: 'get' },
    { path: '/v1/organizations/{organizationId}/members', method: 'get' },
    { path: '/v1/organizations/{organizationId}/invitations', method: 'post' },
    { path: '/v1/organizations/invitations/{token}', method: 'get' },
    { path: '/v1/organizations/invitations/{token}/accept', method: 'post' },
    { path: '/v1/organizations/{organizationId}/members/{membershipId}', method: 'patch' },
    { path: '/v1/organizations/{organizationId}/members/{membershipId}', method: 'delete' },
    { path: '/health', method: 'get' },
] as const

type Node = Record<string, unknown>
type Kind =
    | 'pathItem'
    | 'operation'
    | 'schema'
    | 'parameter'
    | 'response'
    | 'requestBody'
    | 'header'
    | 'mediaType'
    | 'encoding'
    | 'example'
    | 'link'
    | 'callback'
    | 'securityScheme'

const COMPONENT_KINDS: Record<string, Kind> = {
    schemas: 'schema',
    parameters: 'parameter',
    responses: 'response',
    requestBodies: 'requestBody',
    headers: 'header',
    examples: 'example',
    links: 'link',
    callbacks: 'callback',
    securitySchemes: 'securityScheme',
    pathItems: 'pathItem',
}

function isNode(value: unknown): value is Node {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pointerParts(ref: string): string[] {
    if (!ref.startsWith('#/')) throw new Error(`Unsupported local OpenAPI reference: ${ref}`)
    return decodeURIComponent(ref.slice(2))
        .split('/')
        .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
}

function resolvePointer(document: unknown, ref: string): unknown {
    let value = document
    for (const part of pointerParts(ref)) {
        if ((!isNode(value) && !Array.isArray(value)) || !Object.hasOwn(value, part)) {
            throw new Error(`Unresolved local OpenAPI reference: ${ref}`)
        }
        value = (value as Node)[part]
    }
    return value
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys)
    if (!isNode(value)) return value
    return Object.fromEntries(
        Object.keys(value)
            .sort()
            .map(key => [key, sortKeys(value[key])]),
    )
}

function componentReference(category: string, name: string): string {
    const escapedName = encodeURIComponent(name.replace(/~/g, '~0').replace(/\//g, '~1'))
    return `#/components/${category}/${escapedName}`
}

/** Derive the reviewed browser surface without changing the full runtime document. */
export function buildBrowserDocument(full: OpenAPIObject): OpenAPIObject {
    const source = structuredClone(full)
    const browser: OpenAPIObject & { webhooks?: unknown } = {
        ...source,
        paths: {},
        components: {},
        servers: [{ url: '/' }],
    }
    delete browser.webhooks
    if (browser.info.contact?.url) browser.info.contact.url = '/'
    const components = browser.components as Record<string, Node>
    const references = new Set<string>()
    const retainedComponents = new Set<string>()
    const usedTags = new Set<string>()

    for (const { path, method } of BROWSER_OPERATIONS) {
        const pathItem = source.paths[path]
        if (!pathItem?.[method]) throw new Error(`Missing required browser operation: ${method.toUpperCase()} ${path}`)
        // A path reference can import methods outside the reviewed allow list.
        if (pathItem.$ref) throw new Error(`Browser paths must define operations inline: ${path}`)
        if (!browser.paths[path]) {
            browser.paths[path] = { ...pathItem }
            for (const excludedMethod of HTTP_METHODS) delete browser.paths[path][excludedMethod]
        }
        browser.paths[path][method] = pathItem[method]
    }

    function retainReference(ref: string, kind: Kind): void {
        if (!ref.startsWith('#')) return
        if (references.has(ref)) return
        references.add(ref)
        const target = resolvePointer(source, ref)
        const [root, category, name] = pointerParts(ref)
        if (root === 'components') {
            const componentKind = COMPONENT_KINDS[category]
            if (!componentKind || !name) throw new Error(`Unsupported component reference: ${ref}`)
            const identity = JSON.stringify([category, name])
            if (retainedComponents.has(identity)) return
            retainedComponents.add(identity)
            const original = (source.components as Record<string, Node>)[category][name]
            components[category] ??= {}
            Object.defineProperty(components[category], name, {
                value: original,
                enumerable: true,
                writable: true,
                configurable: true,
            })
            visit(original, componentKind)
        } else {
            visit(target, kind)
        }
    }

    function retainSecurity(value: unknown): void {
        if (!Array.isArray(value)) return
        for (const requirement of value) {
            if (!isNode(requirement)) continue
            for (const name of Object.keys(requirement)) {
                retainReference(componentReference('securitySchemes', name), 'securityScheme')
            }
        }
    }

    function visitMap(value: unknown, kind: Kind): void {
        if (isNode(value)) for (const child of Object.values(value)) visit(child, kind)
    }

    function visitArray(value: unknown, kind: Kind): void {
        if (Array.isArray(value)) for (const child of value) visit(child, kind)
    }

    // Walk OpenAPI structure explicitly: example/default payloads and schema property names
    // may themselves contain "$ref", "security", or "servers" as ordinary application data.
    function visit(value: unknown, kind: Kind): void {
        if (!isNode(value)) return
        if (typeof value.$ref === 'string') retainReference(value.$ref, kind)
        switch (kind) {
            case 'pathItem':
                if (value.servers) value.servers = [{ url: '/' }]
                visitArray(value.parameters, 'parameter')
                for (const method of HTTP_METHODS) visit(value[method], 'operation')
                break
            case 'operation':
                if (value.servers) value.servers = [{ url: '/' }]
                if (Array.isArray(value.tags)) {
                    for (const tag of value.tags) if (typeof tag === 'string') usedTags.add(tag)
                }
                retainSecurity(value.security)
                visitArray(value.parameters, 'parameter')
                visit(value.requestBody, 'requestBody')
                visitMap(value.responses, 'response')
                visitMap(value.callbacks, 'callback')
                break
            case 'schema':
                for (const key of ['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions']) {
                    visitMap(value[key], 'schema')
                }
                for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) visitArray(value[key], 'schema')
                for (const key of [
                    'items',
                    'additionalProperties',
                    'additionalItems',
                    'not',
                    'contains',
                    'propertyNames',
                    'unevaluatedProperties',
                    'unevaluatedItems',
                    'if',
                    'then',
                    'else',
                    'contentSchema',
                ])
                    visit(value[key], 'schema')
                if (isNode(value.discriminator) && isNode(value.discriminator.mapping)) {
                    for (const ref of Object.values(value.discriminator.mapping)) {
                        if (typeof ref !== 'string') continue
                        if (ref.startsWith('#')) retainReference(ref, 'schema')
                        else if (source.components?.schemas && Object.hasOwn(source.components.schemas, ref)) {
                            retainReference(componentReference('schemas', ref), 'schema')
                        }
                    }
                }
                break
            case 'parameter':
            case 'header':
                visit(value.schema, 'schema')
                visitMap(value.examples, 'example')
                visitMap(value.content, 'mediaType')
                break
            case 'response':
                visitMap(value.headers, 'header')
                visitMap(value.links, 'link')
                visitMap(value.content, 'mediaType')
                break
            case 'requestBody':
                visitMap(value.content, 'mediaType')
                break
            case 'mediaType':
                visit(value.schema, 'schema')
                visitMap(value.examples, 'example')
                visitMap(value.encoding, 'encoding')
                break
            case 'encoding':
                visitMap(value.headers, 'header')
                break
            case 'link':
                if (value.server) value.server = { url: '/' }
                if (typeof value.operationRef === 'string') retainReference(value.operationRef, 'operation')
                break
            case 'callback':
                for (const [key, item] of Object.entries(value)) {
                    if (key !== '$ref' && !key.startsWith('x-')) visit(item, 'pathItem')
                }
                break
            case 'example':
            case 'securityScheme':
                break
        }
    }

    retainSecurity(browser.security)
    visitMap(browser.paths, 'pathItem')
    if (source.tags) browser.tags = source.tags.filter(tag => usedTags.has(tag.name))
    for (const ref of references) resolvePointer(browser, ref)
    return sortKeys(browser) as OpenAPIObject
}
