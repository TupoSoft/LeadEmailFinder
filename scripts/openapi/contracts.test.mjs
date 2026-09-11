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
        '/credits/{organizationId}',
        '/health',
        '/v1/auth/callback',
        '/v1/auth/login',
        '/v1/auth/logout',
        '/v1/auth/session',
        '/v1/billing/credit-packs',
        '/v1/billing/summary',
        '/v1/credit-purchases',
        '/v1/organizations',
        '/v1/organizations/invitations/{token}',
        '/v1/organizations/invitations/{token}/accept',
        '/v1/organizations/{organizationId}',
        '/v1/organizations/{organizationId}/invitations',
        '/v1/organizations/{organizationId}/members',
        '/v1/organizations/{organizationId}/members/{membershipId}',
        '/v1/organizations/{organizationId}/service-clients',
        '/v1/organizations/{organizationId}/service-clients/{serviceClientId}',
        '/v1/organizations/{organizationId}/service-clients/{serviceClientId}/disable',
        '/v1/organizations/{organizationId}/service-clients/{serviceClientId}/rotate',
        '/verifyAsync',
        '/verifyAsync/{id}',
        '/verifyBatch/csv',
        '/verifyBatch/{id}',
        '/verifyBatch/{id}/results',
    ])
    assert.deepEqual(browser.servers, [{ url: '/' }])
    for (const path of [
        '/verify', '/verifications/{id}', '/v1/proxies',
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
        .filter(([path]) => path.startsWith('/verifyAsync'))
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

test('batch publishes only multipart create, status and CSV download with safe browser contracts', () => {
    const operations = Object.entries(browser.paths)
        .filter(([path]) => /verif|prox/i.test(path) && !path.startsWith('/verifyAsync'))
        .flatMap(([path, item]) => Object.keys(item).map(method => `${method.toUpperCase()} ${path}`))
        .sort()
    assert.deepEqual(operations, ['GET /verifyBatch/{id}', 'GET /verifyBatch/{id}/results', 'POST /verifyBatch/csv'])
    const create = browser.paths['/verifyBatch/csv'].post
    const status = browser.paths['/verifyBatch/{id}'].get
    const download = browser.paths['/verifyBatch/{id}/results'].get
    assert.deepEqual(create.security, [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }])
    for (const operation of [status, download]) {
        assert.deepEqual(operation.security, [{ lef_session: [] }, { oidc: [] }])
        assert.deepEqual(operation.parameters, [{ in: 'path', name: 'id', required: true, schema: { format: 'uuid', type: 'string' } }])
        for (const code of ['400', '401', '403', '404']) assert.ok(operation.responses[code])
    }
    for (const code of ['202', '401', '403', '422']) assert.ok(create.responses[code])
    assert.equal(create.requestBody.required, true)
    assert.deepEqual(Object.keys(create.requestBody.content), ['multipart/form-data'])
    assert.deepEqual(create.requestBody.content['multipart/form-data'].schema, { $ref: '#/components/schemas/UploadFileRequestDto' })
    const schemas = browser.components.schemas
    assert.deepEqual(schemas.UploadFileRequestDto.required, ['file'])
    assert.deepEqual(Object.keys(schemas.UploadFileRequestDto.properties), ['file'])
    assert.equal(schemas.UploadFileRequestDto.properties.file.format, 'binary')
    assert.equal(schemas.UploadFileRequestDto.properties.file.type, 'string')
    assert.equal(schemas.UploadFileResponseDto.properties.id.format, 'uuid')
    assert.deepEqual(Object.keys(schemas.GetBatchStatusResponseDto.properties).sort(), [
        'failureCode', 'id', 'processed', 'progress', 'status', 'total', 'unprocessed',
    ])
    assert.deepEqual(schemas.GetBatchStatusResponseDto.properties.status.enum, ['queued', 'running', 'completed', 'failed', 'unavailable'])
    assert.deepEqual(schemas.GetBatchStatusResponseDto.properties.failureCode.enum, ['invalid_csv', 'insufficient_credits', 'processing_failed'])
    assert.equal(schemas.GetBatchStatusResponseDto.required.includes('failureCode'), false)
    assert.deepEqual(download.responses['200'].content, { 'text/csv': { schema: { type: 'string', format: 'binary' } } })
    assert.ok(download.responses['200'].headers['Content-Disposition'])
})

test('generated batch operations have Blob upload/download types and exact public status fields', async () => {
    const ts = require('typescript')
    const file = resolve(directory, 'batch-contract.ts')
    await writeFile(file, `
        import type { paths } from ${JSON.stringify(schemaPath)}
        type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
        type Assert<T extends true> = T
        type Status = paths['/verifyBatch/{id}']['get']['responses'][200]['content']['application/json']
        type Assertions = [
            Assert<Equal<paths['/verifyBatch/csv']['post']['requestBody']['content']['multipart/form-data'], { file: Blob }>>,
            Assert<Equal<paths['/verifyBatch/csv']['post']['responses'][202]['content']['application/json'], { id: string }>>,
            Assert<Equal<paths['/verifyBatch/{id}/results']['get']['responses'][200]['content']['text/csv'], Blob>>,
            Assert<Equal<Status['status'], 'queued' | 'running' | 'completed' | 'failed' | 'unavailable'>>,
            Assert<Equal<Status['failureCode'], 'invalid_csv' | 'insufficient_credits' | 'processing_failed' | undefined>>,
            Assert<Equal<keyof Status, 'id' | 'status' | 'progress' | 'total' | 'processed' | 'unprocessed' | 'failureCode'>>,
            Assert<Equal<NonNullable<paths['/verifyBatch/csv']['get']>, never>>,
            Assert<Equal<NonNullable<paths['/verifyBatch/{id}']['post']>, never>>,
            Assert<Equal<NonNullable<paths['/verifyBatch/{id}/results']['post']>, never>>
        ]
    `)
    const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022 })
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [])
})

test('binary transformation preserves nullable, optional and ordinary string fields', async () => {
    const snapshot = resolve(directory, 'binary.json')
    const generated = resolve(directory, 'binary.d.ts')
    await writeFile(snapshot, JSON.stringify({
        openapi: '3.0.0', info: { title: 'Binary fixture', version: '1' }, paths: {},
        components: { schemas: { Fixture: {
            type: 'object', required: ['file', 'nullable', 'plain'], properties: {
                file: { type: 'string', format: 'binary' },
                nullable: { type: 'string', format: 'binary', nullable: true },
                optional: { format: 'binary' },
                plain: { type: 'string' },
            },
        } } },
    }))
    await generateSchema(snapshot, generated)
    const source = await readFile(generated, 'utf8')
    assert.match(source, /file: Blob;/)
    assert.match(source, /nullable: Blob \| null;/)
    assert.match(source, /optional\?: Blob;/)
    assert.match(source, /plain: string;/)
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

test('platform organization operations expose a bounded cursor directory and one-time creation contract', () => {
    const operations = browser.paths['/v1/organizations']
    assert.deepEqual(Object.keys(operations).sort(), ['get', 'post'])
    assert.deepEqual(operations, runtime.paths['/v1/organizations'])
    assert.equal(operations.get.operationId, 'OrganizationsController_list')
    assert.equal(operations.post.operationId, 'OrganizationsController_create')
    assert.deepEqual(operations.get.security, [{ lef_session: [] }, { oidc: [] }])
    assert.deepEqual(operations.post.security, [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }])
    for (const operation of Object.values(operations)) {
        assert.match(operation.description, /platform:admin/)
        for (const status of ['400', '401', '403']) assert.ok(operation.responses[status])
    }
    const pageSize = operations.get.parameters.find(parameter => parameter.name === 'pageSize')
    assert.equal(pageSize.in, 'query')
    assert.equal(pageSize.required, false)
    assert.deepEqual(pageSize.schema, { default: 50, maximum: 100, minimum: 1, type: 'integer' })
    const pageToken = operations.get.parameters.find(parameter => parameter.name === 'pageToken')
    assert.equal(pageToken.required, false)
    assert.equal(pageToken.schema.type, 'string')
    assert.equal(pageToken.schema.maxLength, 512)
    const schemas = browser.components.schemas
    const directory = schemas.OrganizationDirectoryResponseDto
    assert.deepEqual(Object.keys(directory.properties).sort(), ['nextPageToken', 'organizations'])
    assert.deepEqual(directory.required, ['organizations'])
    assert.equal(directory.properties.nextPageToken.type, 'string')
    assert.notEqual(directory.properties.nextPageToken.nullable, true)
    assert.deepEqual(Object.keys(schemas.OrganizationDirectoryEntryDto.properties).sort(), ['createdAt', 'id', 'name', 'updatedAt'])
    for (const field of ['createdAt', 'updatedAt']) {
        assert.equal(schemas.OrganizationDirectoryEntryDto.properties[field].format, 'date-time')
    }
    assert.equal(schemas.OrganizationDirectoryEntryDto.properties.id.format, 'uuid')
    assert.deepEqual(Object.keys(schemas.CreateOrganizationDto.properties).sort(), ['name', 'ownerEmail'])
    assert.equal(schemas.CreateOrganizationDto.properties.name.minLength, 1)
    assert.equal(schemas.CreateOrganizationDto.properties.name.maxLength, 200)
    assert.equal(schemas.CreateOrganizationDto.properties.ownerEmail.format, 'email')
    assert.deepEqual(Object.keys(schemas.CreateOrganizationResponseDto.properties).sort(), ['invitation', 'organizationId'])
    assert.match(schemas.InvitationResponseDto.properties.token.description, /One-time secret/)
    for (const response of Object.values(operations.post.responses)) {
        assert.deepEqual(response.headers['Cache-Control'].schema.enum, ['no-store'])
        assert.deepEqual(response.headers['Referrer-Policy'].schema.enum, ['no-referrer'])
    }
})

test('generated platform directory types expose optional cursors without totals or invitation secrets', async () => {
    const ts = require('typescript')
    const file = resolve(directory, 'organization-directory-contract.ts')
    await writeFile(file, `
        import type { paths, components } from ${JSON.stringify(schemaPath)}
        type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
        type Assert<T extends true> = T
        type List = paths['/v1/organizations']['get']['responses'][200]['content']['application/json']
        type Query = NonNullable<paths['/v1/organizations']['get']['parameters']['query']>
        type Created = paths['/v1/organizations']['post']['responses'][201]['content']['application/json']
        type Assertions = [
            Assert<Equal<keyof List, 'organizations' | 'nextPageToken'>>,
            Assert<Equal<List['nextPageToken'], string | undefined>>,
            Assert<Equal<keyof List['organizations'][number], 'id' | 'name' | 'createdAt' | 'updatedAt'>>,
            Assert<Equal<List['organizations'][number]['createdAt'], string>>,
            Assert<Equal<Query['pageSize'], number | undefined>>,
            Assert<Equal<Query['pageToken'], string | undefined>>,
            Assert<Equal<Created['invitation'], components['schemas']['InvitationResponseDto']>>,
            Assert<Equal<Created['invitation']['token'], string>>
        ]
    `)
    const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022 })
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [])
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


test('platform credit and organization detail operations retain complete protected browser contracts', () => {
    const detail = browser.paths['/v1/organizations/{organizationId}']
    const credits = browser.paths['/credits/{organizationId}']
    assert.deepEqual(Object.keys(detail), ['get'])
    assert.deepEqual(Object.keys(credits), ['get', 'post', 'put'])
    for (const [path, method, statuses] of [
        ['/v1/organizations/{organizationId}', 'get', ['200', '400', '401', '403', '404', '500']],
        ['/credits/{organizationId}', 'get', ['200', '400', '401', '403', '500']],
        ['/credits/{organizationId}', 'post', ['201', '400', '401', '403', '409']],
        ['/credits/{organizationId}', 'put', ['200', '400', '401', '403', '409', '500']],
    ]) {
        const operation = browser.paths[path][method]
        assert.deepEqual(operation, runtime.paths[path][method])
        assert.match(operation.description, /platform:admin/)
        assert.deepEqual(operation.security, method === 'get'
            ? [{ lef_session: [] }, { oidc: [] }]
            : [{ lef_session: [], 'x-csrf-token': [] }, { oidc: [] }])
        assert.deepEqual(Object.keys(operation.responses).sort(), statuses)
        const organizationId = operation.parameters.find(parameter => parameter.name === 'organizationId')
        assert.equal(organizationId.in, 'path')
        assert.equal(organizationId.required, true)
        assert.deepEqual(organizationId.schema, { type: 'string', format: 'uuid' })
    }
    assert.deepEqual(detail.get.responses['200'].content['application/json'].schema,
        { $ref: '#/components/schemas/OrganizationDirectoryEntryDto' })
    const header = credits.post.parameters.find(parameter => parameter.name === 'Idempotency-Key')
    assert.equal(header.in, 'header')
    assert.equal(header.required, true)
    assert.deepEqual(header.schema, { type: 'string', format: 'uuid' })
    assert.match(credits.post.description, /equivalent replay return 201/)
    for (const method of ['get', 'put']) {
        assert.equal(credits[method].parameters.some(parameter => parameter.in === 'header'), false)
    }
    for (const [method, dto, minimum] of [['post', 'AddCreditsDto', 1], ['put', 'SetBalanceDto', 0]]) {
        assert.equal(credits[method].requestBody.required, true)
        assert.deepEqual(credits[method].requestBody.content['application/json'].schema,
            { $ref: '#/components/schemas/' + dto })
        assert.deepEqual(browser.components.schemas[dto].required, ['amount'])
        assert.equal(browser.components.schemas[dto].properties.amount.type, 'integer')
        assert.equal(browser.components.schemas[dto].properties.amount.minimum, minimum)
    }
    for (const method of ['get', 'post', 'put']) {
        assert.deepEqual(credits[method].responses[method === 'post' ? '201' : '200'].content['application/json'].schema,
            { $ref: '#/components/schemas/CreditResponseDto' })
    }
})

test('generated platform credits require the caller key and preserve exact request and response types', async () => {
    const ts = require('typescript')
    const file = resolve(directory, 'platform-credit-contract.ts')
    await writeFile(file, `
        import type { paths, components } from ${JSON.stringify(schemaPath)}
        type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
        type Assert<T extends true> = T
        type Credit = paths['/credits/{organizationId}']
        type Detail = paths['/v1/organizations/{organizationId}']['get']['responses'][200]['content']['application/json']
        type Assertions = [
            Assert<Equal<Credit['post']['parameters']['header'], { 'Idempotency-Key': string }>>,
            Assert<Equal<Credit['get']['parameters']['path'], { organizationId: string }>>,
            Assert<Equal<Credit['post']['requestBody']['content']['application/json'], { amount: number }>>,
            Assert<Equal<Credit['put']['requestBody']['content']['application/json'], { amount: number }>>,
            Assert<Equal<Credit['get']['responses'][200]['content']['application/json'], { balance: number }>>,
            Assert<Equal<Credit['post']['responses'][201]['content']['application/json'], { balance: number }>>,
            Assert<Equal<Credit['put']['responses'][200]['content']['application/json'], { balance: number }>>,
            Assert<Equal<Detail, components['schemas']['OrganizationDirectoryEntryDto']>>,
            Assert<Equal<keyof Detail, 'id' | 'name' | 'createdAt' | 'updatedAt'>>
        ]
    `)
    const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022 })
    assert.deepEqual(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [])
})
