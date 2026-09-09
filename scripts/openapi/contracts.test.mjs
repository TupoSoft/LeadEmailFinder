import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { after, before, test } from 'node:test'
import { mkdtemp, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import {
    assertTrackedArtifacts,
    checkArtifacts,
    exportDocuments,
    generateSchema,
    rootDirectory,
    snapshotPath,
    schemaPath,
} from './contracts.mjs'

const require = createRequire(import.meta.url)

let directory
let browser
let runtime
before(async () => {
    directory = await mkdtemp(resolve(tmpdir(), 'lef-contract-test-'))
    exportDocuments(directory, {})
    browser = JSON.parse(await readFile(resolve(directory, 'browser.json'), 'utf8'))
    runtime = JSON.parse(await readFile(resolve(directory, 'runtime.json'), 'utf8'))
})
after(async () => {
    if (directory) await rm(directory, { recursive: true, force: true })
})

test('blocks TCP, listeners, UDP creation, and callback/promise DNS before network I/O', () => {
    execFileSync(
        process.execPath,
        [
            '-r',
            require.resolve('ts-node/register/transpile-only'),
            '-e',
            `
        const assert = require('node:assert/strict');
        require('./scripts/openapi/deny-network').denyNetwork();
        const net = require('node:net');
        const dns = require('node:dns');
        const promises = require('node:dns/promises');
        for (const attempt of [
            () => net.connect(9, '127.0.0.1'),
            () => net.createServer().listen(0),
            () => require('node:dgram').createSocket('udp4'),
            () => dns.lookup('metadata.invalid', () => {}),
            () => dns.resolveMx('metadata.invalid', () => {}),
            () => promises.resolveMx('metadata.invalid'),
            () => new dns.Resolver().resolveMx('metadata.invalid', () => {}),
            () => new promises.Resolver().resolveMx('metadata.invalid'),
        ]) assert.throws(attempt, { message: 'Network I/O is forbidden during OpenAPI export' });
    `,
        ],
        { cwd: rootDirectory, stdio: 'pipe' },
    )
})

test('rejects generated artifacts that exist but are not tracked in Git', async () => {
    const repository = await mkdtemp(resolve(tmpdir(), 'lef-untracked-test-'))
    try {
        execFileSync('git', ['init', '--quiet'], { cwd: repository })
        await writeFile(resolve(repository, 'browser.json'), '{}')
        await writeFile(resolve(repository, 'schema.d.ts'), 'export {}')
        assert.throws(() => assertTrackedArtifacts(repository, ['browser.json', 'schema.d.ts']), /must be tracked/)
        execFileSync('git', ['add', 'browser.json', 'schema.d.ts'], { cwd: repository })
        assert.doesNotThrow(() => assertTrackedArtifacts(repository, ['browser.json', 'schema.d.ts']))
    } finally {
        await rm(repository, { recursive: true, force: true })
    }
})

test('exports the real app from an empty environment without provider construction or network I/O', () => {
    assert.deepEqual(Object.keys(browser.paths), [
        '/health',
        '/v1/auth/callback',
        '/v1/auth/login',
        '/v1/auth/logout',
        '/v1/auth/session',
        '/v1/billing/credit-packs',
        '/v1/billing/summary',
        '/v1/credit-purchases',
        '/v1/organizations/invitations/{token}',
        '/v1/organizations/invitations/{token}/accept',
        '/v1/organizations/{organizationId}/invitations',
        '/v1/organizations/{organizationId}/members',
        '/v1/organizations/{organizationId}/members/{membershipId}',
        '/v1/organizations/{organizationId}/service-clients',
        '/v1/organizations/{organizationId}/service-clients/{serviceClientId}',
        '/v1/organizations/{organizationId}/service-clients/{serviceClientId}/disable',
        '/v1/organizations/{organizationId}/service-clients/{serviceClientId}/rotate',
        '/verifyAsync',
        '/verifyAsync/{id}',
    ])
    assert.deepEqual(browser.servers, [{ url: '/' }])
    for (const path of [
        '/verify', '/verifications/{id}', '/verifyBatch/csv', '/verifyBatch/{id}', '/verifyBatch/{id}/results', '/v1/proxies',
    ]) {
        assert.ok(Object.hasOwn(runtime.paths, path), `Full runtime docs retain ${path}`)
        assert.equal(Object.hasOwn(browser.paths, path), false, `Browser docs exclude ${path}`)
    }
    const account = browser.components.schemas.CurrentAccountContextDto
    assert.equal(account.properties.email.nullable, true)
    for (const secret of ['credentialId', 'sessionId', 'accessToken', 'refreshToken', 'idToken', 'csrfToken']) {
        assert.equal(Object.hasOwn(account.properties, secret), false)
    }
    assert.deepEqual(browser.paths['/v1/auth/session'].get.security, [{ lef_session: [] }])
    for (const code of ['200', '401', '403']) assert.ok(browser.paths['/v1/auth/session'].get.responses[code])
})

test('async verification publishes only create and status reads with their authentication and error contracts', () => {
    const operations = Object.entries(browser.paths)
        .filter(([path]) => /verif|prox/i.test(path))
        .flatMap(([path, item]) => Object.keys(item).map(method => `${method.toUpperCase()} ${path}`))
        .sort()
    assert.deepEqual(operations, ['GET /verifyAsync/{id}', 'POST /verifyAsync'])
    const create = browser.paths['/verifyAsync'].post
    const status = browser.paths['/verifyAsync/{id}'].get
    assert.deepEqual(create.security, [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }])
    assert.deepEqual(status.security, [{ lef_session: [] }, { oidc: [] }])
    assert.deepEqual(Object.keys(create.responses).sort(), ['202', '400', '401', '402', '403'])
    assert.deepEqual(Object.keys(status.responses).sort(), ['200', '400', '401', '403', '404'])
    assert.equal(create.requestBody.required, true)
    assert.deepEqual(create.requestBody.content['application/json'].schema, {
        $ref: '#/components/schemas/VerifyAsyncRequestBodyDto',
    })
    assert.deepEqual(create.responses['202'].content['application/json'].schema, {
        $ref: '#/components/schemas/VerifyAsyncResponseDto',
    })
    assert.deepEqual(status.parameters, [{ in: 'path', name: 'id', required: true, schema: { format: 'uuid', type: 'string' } }])
    const schemas = browser.components.schemas
    assert.deepEqual(schemas.VerifyAsyncRequestBodyDto.required, ['email'])
    assert.deepEqual(Object.keys(schemas.VerifyAsyncRequestBodyDto.properties), ['email'])
    assert.equal(schemas.VerifyAsyncRequestBodyDto.properties.email.format, 'email')
    assert.deepEqual(schemas.VerifyAsyncResponseDto.required, ['id'])
    assert.deepEqual(Object.keys(schemas.VerifyAsyncResponseDto.properties), ['id'])
    assert.equal(schemas.VerifyAsyncResponseDto.properties.id.format, 'uuid')
})

test('async status exposes five discriminated outcomes and only safe result fields', () => {
    const content = browser.paths['/verifyAsync/{id}'].get.responses['200'].content['application/json']
    const variants = {
        queued: 'AsyncVerificationQueuedResponseDto',
        running: 'AsyncVerificationRunningResponseDto',
        completed: 'AsyncVerificationCompletedResponseDto',
        failed: 'AsyncVerificationFailedResponseDto',
        unavailable: 'AsyncVerificationUnavailableResponseDto',
    }
    const mapping = Object.fromEntries(Object.entries(variants).map(([state, name]) => [state, `#/components/schemas/${name}`]))
    assert.deepEqual(content.schema.discriminator, { propertyName: 'state', mapping })
    assert.deepEqual(content.schema.oneOf, Object.values(mapping).map($ref => ({ $ref })))
    const schemas = browser.components.schemas
    for (const [state, name] of Object.entries(variants)) {
        const schema = schemas[name]
        const fields = state === 'completed' ? ['result', 'state'] : state === 'failed' ? ['failureCode', 'state'] : ['state']
        assert.deepEqual(schema.properties.state, { type: 'string', enum: [state] })
        assert.deepEqual(Object.keys(schema.properties).sort(), fields)
        assert.deepEqual([...schema.required].sort(), fields)
        assert.equal(content.examples[state].value.state, state)
        assert.deepEqual(Object.keys(content.examples[state].value).sort(), fields)
    }
    assert.deepEqual(schemas.AsyncVerificationFailedResponseDto.properties.failureCode.enum, ['verification_failed'])
    assert.deepEqual(content.examples.failed.value, { state: 'failed', failureCode: 'verification_failed' })
    assert.deepEqual(schemas.AsyncVerificationCompletedResponseDto.properties.result, {
        $ref: '#/components/schemas/AsyncVerificationResultDto',
    })
    const result = schemas.AsyncVerificationResultDto
    assert.deepEqual(Object.keys(result.properties).sort(), [
        'catchAll', 'domain', 'email', 'exists', 'format', 'id', 'localPart', 'mxDomain', 'reason', 'sources', 'targetExchange',
    ])
    assert.deepEqual([...result.required].sort(), ['catchAll', 'domain', 'email', 'exists', 'id', 'localPart', 'reason', 'sources'])
    for (const field of ['exists', 'catchAll']) {
        assert.equal(result.properties[field].type, 'boolean')
        assert.equal(result.properties[field].nullable, true)
    }
})

test('generated async types preserve exact state discrimination, required results, and nullable evidence', async () => {
    const ts = require('typescript')
    const file = resolve(directory, 'async-contract.ts')
    await writeFile(file, `
        import type { paths, components } from ${JSON.stringify(schemaPath)}
        type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
        type Assert<T extends true> = T
        type Status = paths['/verifyAsync/{id}']['get']['responses'][200]['content']['application/json']
        type Result = components['schemas']['AsyncVerificationResultDto']
        type Assertions = [
            Assert<Equal<Status['state'], 'queued' | 'running' | 'completed' | 'failed' | 'unavailable'>>,
            Assert<Equal<Extract<Status, { state: 'completed' }>, { state: 'completed'; result: Result }>>,
            Assert<Equal<Extract<Status, { state: 'failed' }>, { state: 'failed'; failureCode: 'verification_failed' }>>,
            Assert<Equal<Extract<Status, { state: 'queued' }>, { state: 'queued' }>>,
            Assert<Equal<Extract<Status, { state: 'running' }>, { state: 'running' }>>,
            Assert<Equal<Extract<Status, { state: 'unavailable' }>, { state: 'unavailable' }>>,
            Assert<Equal<Result['exists'], boolean | null>>,
            Assert<Equal<Result['catchAll'], boolean | null>>,
            Assert<Equal<keyof Result, 'id' | 'email' | 'localPart' | 'domain' | 'format' | 'exists' | 'catchAll' | 'reason' | 'sources' | 'mxDomain' | 'targetExchange'>>,
            Assert<Equal<paths['/verifyAsync']['post']['responses'][202]['content']['application/json'], { id: string }>>,
            Assert<Equal<NonNullable<paths['/verifyAsync']['get']>, never>>,
            Assert<Equal<NonNullable<paths['/verifyAsync/{id}']['post']>, never>>
        ]
    `)
    const program = ts.createProgram([file], {
        strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022,
    })
    const diagnostics = ts.getPreEmitDiagnostics(program)
    assert.deepEqual(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [])
})

test('billing exposes exactly the consumed methods and safe customer fields through generated types', async () => {
    const billing = Object.entries(browser.paths)
        .filter(([path]) => path.includes('/billing/') || path.includes('credit-purchases'))
        .flatMap(([path, item]) => Object.keys(item).map(method => `${method.toUpperCase()} ${path}`))
        .sort()
    assert.deepEqual(billing, [
        'GET /v1/billing/credit-packs',
        'GET /v1/billing/summary',
        'GET /v1/credit-purchases',
        'POST /v1/credit-purchases',
    ])
    const schemas = browser.components.schemas
    assert.deepEqual(Object.keys(schemas.BillingCreditPackResponseDto.properties).sort(), [
        'amountMinor',
        'credits',
        'currency',
        'id',
    ])
    assert.deepEqual(Object.keys(schemas.CreditPurchaseResponseDto.properties).sort(), [
        'amountMinor',
        'createdAt',
        'credits',
        'currency',
        'id',
        'packId',
        'status',
        'updatedAt',
    ])
    assert.deepEqual(Object.keys(schemas.CreateCreditPurchaseDto.properties), ['packId'])
    assert.deepEqual(Object.keys(schemas.CreditResponseDto.properties), ['balance'])
    const generated = await readFile(schemaPath, 'utf8')
    for (const field of ['providerPriceId', 'providerReference', 'provider:', 'webhookId', 'eventId', 'rawPayload']) {
        assert.equal(JSON.stringify(browser).includes(`"${field.replace(':', '')}"`), false, field)
        assert.equal(generated.includes(field), false, field)
    }
    for (const [path, method] of [
        ['/v1/billing/summary', 'get'],
        ['/v1/billing/credit-packs', 'get'],
        ['/v1/credit-purchases', 'get'],
        ['/v1/credit-purchases', 'post'],
    ]) {
        assert.match(generated, new RegExp(browser.paths[path][method].operationId))
        assert.deepEqual(
            browser.paths[path][method].security,
            method === 'post'
                ? [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }]
                : [{ lef_session: [] }, { oidc: [] }],
        )
        for (const code of ['401', '403']) assert.ok(browser.paths[path][method].responses[code])
    }
})

test('runtime verification docs retain the current POST contract and omit the retired GET contract', () => {
    const verification = runtime.paths['/verify']
    assert.ok(verification.post)
    assert.equal(Object.hasOwn(verification, 'get'), false)
    assert.notEqual(verification.post.deprecated, true)
    assert.deepEqual(verification.post.requestBody.content['application/json'].schema, {
        $ref: '#/components/schemas/EmailVerificationRequestDto',
    })
    assert.deepEqual(verification.post.responses['201'].content['application/json'].schema, {
        $ref: '#/components/schemas/EmailVerificationResponseDto',
    })
    assert.equal(Object.hasOwn(verification.post.responses, '200'), false)

    const schemas = runtime.components.schemas
    assert.equal(Object.hasOwn(schemas, 'OldSyncEmailVerificationRequestQueryDto'), false)
    assert.equal(Object.hasOwn(schemas, 'OldSyncEmailVerificationResponseDto'), false)
    assert.equal(schemas.EmailVerificationRequestDto.properties.email.type, 'string')
    const response = schemas.EmailVerificationResponseDto
    assert.deepEqual(Object.keys(response.properties).sort(), [
        'catchAll', 'createdAt', 'domain', 'email', 'exists', 'format', 'id', 'localPart', 'mxDomain',
        'reason', 'sources', 'targetExchange',
    ])
    assert.equal(response.properties.id.type, 'string')
    assert.equal(response.properties.email.type, 'string')
    assert.equal(response.properties.sources.type, 'array')
})

test('ambient configuration and secret-file settings cannot change the export', async () => {
    const second = await mkdtemp(resolve(tmpdir(), 'lef-contract-ambient-'))
    try {
        exportDocuments(second, {
            NODE_ENV: 'production',
            API_URL: 'https://unexpected.invalid',
            POSTGRES_URL_FILE: '/missing/private-value',
            PAYMENTS_PROVIDER: 'invalid',
            NODE_OPTIONS: '',
        })
        assert.equal(
            await readFile(resolve(second, 'browser.json'), 'utf8'),
            await readFile(resolve(directory, 'browser.json'), 'utf8'),
        )
    } finally {
        await rm(second, { recursive: true, force: true })
    }
})

test('checks committed artifacts byte for byte and leaves them untouched', async () => {
    const before = await Promise.all([readFile(snapshotPath), readFile(schemaPath)])
    await checkArtifacts(directory)
    assert.deepEqual(await Promise.all([readFile(snapshotPath), readFile(schemaPath)]), before)
})

test('rejects missing or stale JSON and TypeScript without repairing either file', async () => {
    const snapshot = resolve(directory, 'committed.json')
    const schema = resolve(directory, 'committed.d.ts')
    for (const missing of ['json', 'typescript']) {
        await copyFile(resolve(directory, 'browser.json'), snapshot)
        await generateSchema(snapshot, schema)
        await rm(missing === 'json' ? snapshot : schema)
        await assert.rejects(checkArtifacts(directory, snapshot, schema), /Missing OpenAPI artifact/)
        assert.equal(
            (await readdir(directory)).includes(missing === 'json' ? 'committed.json' : 'committed.d.ts'),
            false,
        )
    }
    for (const stale of ['json', 'typescript']) {
        await copyFile(resolve(directory, 'browser.json'), snapshot)
        await generateSchema(snapshot, schema)
        const path = stale === 'json' ? snapshot : schema
        const original = await readFile(path, 'utf8')
        await writeFile(path, original + '\n')
        await assert.rejects(checkArtifacts(directory, snapshot, schema), /OpenAPI drift/)
        assert.equal(await readFile(path, 'utf8'), original + '\n')
    }
})


test('team and invitation operations publish reviewed safe browser contracts', () => {
    const schemas = browser.components.schemas
    assert.equal(Object.hasOwn(runtime.paths, '/v1/organizations'), false)
    assert.equal(schemas.MembershipResponseDto.properties.email.nullable, true)
    assert.deepEqual(schemas.MembershipResponseDto.properties.status.enum, ['active', 'disabled'])
    assert.equal(schemas.AcceptInvitationDto.properties.password.minLength, 12)
    assert.equal(schemas.AcceptInvitationDto.properties.password.writeOnly, true)
    assert.deepEqual(Object.keys(schemas.InvitationAcceptedResponseDto.properties), ['status'])
    assert.deepEqual(schemas.InvitationAcceptedResponseDto.properties.status.enum, ['accepted'])
    assert.deepEqual(Object.keys(schemas.InvitationPreviewResponseDto.properties), ['email', 'expiresAt', 'organizationName', 'role', 'status'])
    for (const [path, method] of [
        ['/v1/organizations/invitations/{token}', 'get'],
        ['/v1/organizations/invitations/{token}/accept', 'post'],
        ['/v1/organizations/{organizationId}/invitations', 'post'],
    ]) {
        const operation = browser.paths[path][method]
        for (const response of Object.values(operation.responses)) {
            assert.deepEqual(response.headers['Cache-Control'].schema.enum, ['no-store'])
            assert.deepEqual(response.headers['Referrer-Policy'].schema.enum, ['no-referrer'])
        }
        if (path.includes('/invitations/{token}')) assert.deepEqual(operation.security, [])
    }
    const preview = browser.paths['/v1/organizations/invitations/{token}'].get
    for (const status of ['200', '404', '410']) assert.ok(preview.responses[status])
    assert.deepEqual(schemas.InvitationGoneResponseDto.properties.code.enum, ['invitation_expired', 'invitation_consumed'])
    for (const method of ['patch', 'delete']) {
        const operation = browser.paths['/v1/organizations/{organizationId}/members/{membershipId}'][method]
        assert.deepEqual(operation.security, [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }])
        for (const status of ['401', '403', '404', '409']) assert.ok(operation.responses[status])
    }
})


test('service-client operations publish exact session, UUID, secret and error contracts', () => {
    const base = '/v1/organizations/{organizationId}/service-clients'
    const member = base + '/{serviceClientId}'
    const expected = [
        [base, 'get', ['200', '400', '401', '403', '500']],
        [base, 'post', ['201', '400', '401', '403', '500']],
        [member, 'delete', ['204', '400', '401', '403', '404', '500']],
        [member + '/disable', 'post', ['204', '400', '401', '403', '404', '500']],
        [member + '/rotate', 'post', ['200', '400', '401', '403', '404', '409', '500']],
    ]
    const operations = Object.entries(browser.paths)
        .filter(([path]) => path.includes('/service-clients'))
        .flatMap(([path, item]) => Object.keys(item).map(method => `${method.toUpperCase()} ${path}`))
        .sort()
    assert.deepEqual(operations, expected.map(([path, method]) => `${method.toUpperCase()} ${path}`).sort())
    for (const [path, method, statuses] of expected) {
        const operation = browser.paths[path][method]
        assert.deepEqual(operation, runtime.paths[path][method])
        assert.deepEqual(Object.keys(operation.responses).sort(), statuses)
        assert.deepEqual(operation.security, method === 'get' ? [{ lef_session: [] }] : [{ lef_session: [], 'x-csrf-token': [] }])
        for (const parameter of operation.parameters) {
            assert.equal(parameter.in, 'path')
            assert.equal(parameter.required, true)
            assert.deepEqual(parameter.schema, { format: 'uuid', type: 'string' })
        }
        assert.deepEqual(operation.parameters.map(parameter => parameter.name).sort(), path === base ? ['organizationId'] : ['organizationId', 'serviceClientId'])
        if ((path === base && method === 'post') || path.endsWith('/rotate')) {
            for (const response of Object.values(operation.responses)) {
                assert.deepEqual(response.headers['Cache-Control'].schema.enum, ['no-store'])
            }
        }
    }
    const schemas = browser.components.schemas
    assert.equal(schemas.CreateServiceClientDto.properties.permissions.minItems, 1)
    assert.equal(schemas.CreateServiceClientDto.properties.permissions.uniqueItems, true)
    assert.deepEqual(schemas.CreateServiceClientDto.required, ['permissions'])
    assert.equal(schemas.CreateServiceClientDto.properties.description.maxLength, 200)
    const response = schemas.ServiceClientResponseDto
    assert.deepEqual(Object.keys(response.properties).sort(), ['clientId', 'createdAt', 'description', 'id', 'permissions', 'status', 'updatedAt'])
    assert.deepEqual(response.properties.status.enum, ['active', 'disabled'])
    assert.equal(response.properties.description.nullable, true)
    assert.equal(response.properties.id.format, 'uuid')
    assert.deepEqual(response.properties.permissions.items.enum, schemas.CreateServiceClientDto.properties.permissions.items.enum)
    assert.equal(schemas.ServiceClientSecretResponseDto.properties.clientSecret.type, 'string')
    assert.deepEqual(browser.paths[base].get.responses['200'].content['application/json'].schema, {
        type: 'array', items: { $ref: '#/components/schemas/ServiceClientResponseDto' },
    })
})

test('generated service-client list types exclude clientSecret and preserve permission and status unions', async () => {
    const ts = require('typescript')
    const file = resolve(directory, 'service-client-contract.ts')
    await writeFile(file, `
        import type { paths, components } from ${JSON.stringify(schemaPath)}
        type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
        type Assert<T extends true> = T
        type List = paths['/v1/organizations/{organizationId}/service-clients']['get']['responses'][200]['content']['application/json']
        type Created = paths['/v1/organizations/{organizationId}/service-clients']['post']['responses'][201]['content']['application/json']
        type Rotated = paths['/v1/organizations/{organizationId}/service-clients/{serviceClientId}/rotate']['post']['responses'][200]['content']['application/json']
        type Assertions = [
            Assert<Equal<Extract<'clientSecret', keyof List[number]>, never>>,
            Assert<Equal<List[number], components['schemas']['ServiceClientResponseDto']>>,
            Assert<Equal<List[number]['status'], 'active' | 'disabled'>>,
            Assert<Equal<List[number]['description'], string | null>>,
            Assert<Equal<List[number]['permissions'][number], components['schemas']['CreateServiceClientDto']['permissions'][number]>>,
            Assert<Equal<Created['clientSecret'], string>>,
            Assert<Equal<Rotated['clientSecret'], string>>,
            Assert<Equal<keyof Created, keyof List[number] | 'clientSecret'>>,
            Assert<Equal<keyof Rotated, keyof List[number] | 'clientSecret'>>
        ]
    `)
    const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022 })
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [])
})
