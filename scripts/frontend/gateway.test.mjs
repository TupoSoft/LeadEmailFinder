import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { test } from 'node:test'
import { API_PREFIXES, API_EXACT_PATHS, STATIC_SECURITY_HEADERS, isApiRequest } from '../../apps/web/gateway-routes.ts'

const execFile = promisify(execFileCallback)
const repository = resolve(import.meta.dirname, '../..')
const webRequire = createRequire(join(repository, 'apps/web/package.json'))
const image = process.env.WEB_GATEWAY_IMAGE || 'lead-email-finder-web:frontend-06'
const marker = 'gateway-private-marker'
const apiPaths = [...API_PREFIXES.flatMap((path) => [path, `${path}/not-real`]), ...API_EXACT_PATHS, '/v%31/not-real', '/v1%2Fnot-real', '/v1//not-real']
const uiPaths = ['/', '/50x.html', '/not-real', '/v1-other', '/verify-more', '/health/child', '/docs-json/child', '/openapi.json-more', '/v%31-other', '/v1%2F..%2Fnot-real']

// Executed both in-process and in an isolated container; it never writes requests.
function fixture(request, response) {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
        const path = new URL(request.url, 'http://api').pathname
        if (path === '/v1/auth/callback') {
            response.writeHead(302, {
                location: '/app?complete=true',
                'set-cookie': ['lef_session=opaque; Path=/; HttpOnly; SameSite=Lax', 'lef_csrf=csrf; Path=/; SameSite=Lax'],
                'cache-control': 'no-store',
                'referrer-policy': 'no-referrer',
            })
            response.end()
        } else if (path === '/v1/gateway-probe') {
            response.writeHead(201, { 'content-type': 'application/json', 'cache-control': 'no-store' })
            response.end(JSON.stringify({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString() }))
        } else {
            response.writeHead(path === '/health' ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' })
            response.end(JSON.stringify({ owner: 'api' }))
        }
    })
}

async function routeMatrix(origin) {
    for (const path of apiPaths) {
        const response = await fetch(`${origin}${path}?query=${marker}`)
        assert.equal(response.status, path === '/health' ? 200 : 404, path)
        assert.match(response.headers.get('content-type'), /application\/json/, path)
        assert.equal(response.headers.get('cache-control'), 'no-store', path)
        assert.deepEqual(await response.json(), { owner: 'api' }, path)
    }
    for (const path of uiPaths) {
        const response = await fetch(`${origin}${path}`)
        assert.equal(response.status, 200, path)
        assert.match(response.headers.get('content-type'), /text\/html/, path)
        assert.match(await response.text(), /<div id="root"><\/div>/, path)
    }
    const body = JSON.stringify({ value: marker })
    const response = await fetch(`${origin}/v1/gateway-probe?query=${marker}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `session=${marker}`, authorization: `Bearer ${marker}`, 'x-csrf-token': marker, origin },
        body,
    })
    assert.equal(response.status, 201)
    const received = await response.json()
    assert.equal(received.method, 'POST')
    assert.equal(received.url, `/v1/gateway-probe?query=${marker}`)
    assert.equal(received.body, body)
    assert.equal(received.headers.cookie, `session=${marker}`)
    assert.equal(received.headers.authorization, `Bearer ${marker}`)
    assert.equal(received.headers['x-csrf-token'], marker)
    assert.equal(received.headers.origin, origin)
    assert.equal(received.headers.host, new URL(origin).host)
    assert.equal(received.headers['x-forwarded-host'], new URL(origin).host)
    assert.equal(received.headers['x-forwarded-proto'], 'http')
    assert.equal(received.headers['x-forwarded-port'], new URL(origin).port)
    const uploadBody = marker.repeat(60_000)
    const upload = await fetch(`${origin}/v1/gateway-probe`, { method: 'POST', body: uploadBody })
    assert.equal(upload.status, 201, 'API uploads must retain their application-owned size limits')
    assert.equal((await upload.json()).body, uploadBody)
    const callback = await fetch(`${origin}/v1/auth/callback?code=${marker}&state=${marker}`, { redirect: 'manual' })
    assert.equal(callback.status, 302)
    assert.equal(callback.headers.get('location'), '/app?complete=true')
    assert.equal(callback.headers.get('cache-control'), 'no-store')
    assert.equal(callback.headers.get('referrer-policy'), 'no-referrer')
    assert.deepEqual(callback.headers.getSetCookie(), [
        'lef_session=opaque; Path=/; HttpOnly; SameSite=Lax',
        'lef_csrf=csrf; Path=/; SameSite=Lax',
    ])
}

function assertSecurityHeaders(response) {
    for (const [header, expected] of Object.entries(STATIC_SECURITY_HEADERS)) {
        assert.equal(response.headers.get(header), expected, header)
    }
}

async function docker(...arguments_) {
    return (await execFile('docker', arguments_, { maxBuffer: 2 * 1024 * 1024 })).stdout.trim()
}

async function waitForReady(origin) {
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            if ((await fetch(origin)).status === 200) return
        } catch { /* A newly launched listener may not be ready yet. */ }
        await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('Gateway did not become ready')
}

test('explicit API ownership excludes similarly named UI routes', () => {
    for (const path of apiPaths) {
        assert.equal(isApiRequest(path), true, path)
        assert.equal(isApiRequest(`${path}?value=${marker}`), true, path)
    }
    for (const path of uiPaths) assert.equal(isApiRequest(path), false, path)
})

test('Compose exposes only the gateway and keeps isolated public origins consistent', async () => {
    for (const ports of [
        { WEB_PORT: '53000', KEYCLOAK_PORT: '58080' },
        { WEB_PORT: '53101', KEYCLOAK_PORT: '58101' },
    ]) {
        const { stdout } = await execFile('docker', ['compose', '-f', 'docker/compose.yaml', 'config', '--format', 'json'], {
            cwd: repository,
            env: { ...process.env, ...ports },
        })
        const { services } = JSON.parse(stdout)
        assert.equal(services.api.ports?.length ?? 0, 0)
        assert.equal(services.web.ports.length, 1)
        assert.equal(services.web.ports[0].target, 8080)
        assert.equal(String(services.web.ports[0].published), ports.WEB_PORT)
        assert.equal(services.api.environment.APP_BASE_URL, `http://localhost:${ports.WEB_PORT}`)
        assert.equal(services.api.environment.PAYMENTS_CHECKOUT_URL, `http://localhost:${ports.WEB_PORT}/billing/complete`)
        assert.equal(services.api.environment.OIDC_ISSUER_URL, `http://localhost:${ports.KEYCLOAK_PORT}/realms/lead-email-finder`)
        assert.equal(services.keycloak.environment.KC_HOSTNAME, `http://localhost:${ports.KEYCLOAK_PORT}`)
        assert.equal(services.api.environment.OIDC_BACKCHANNEL_URL, 'http://keycloak:8080/realms/lead-email-finder')
        assert.equal(services.web.build.dockerfile, 'docker/web.Dockerfile')
        assert.equal(services.api.build.dockerfile, 'docker/Dockerfile')
    }
})

test('Vite forwards the route matrix and browser request/response contract', async (context) => {
    const backend = createServer(fixture)
    backend.listen(0, '127.0.0.1')
    await once(backend, 'listening')
    context.after(() => new Promise((resolve) => backend.close(resolve)))
    const previousTarget = process.env.WEB_API_PROXY_TARGET
    process.env.WEB_API_PROXY_TARGET = `http://127.0.0.1:${backend.address().port}`
    const { createServer: createViteServer } = await import(webRequire.resolve('vite'))
    const server = await createViteServer({ root: join(repository, 'apps/web'), server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' })
    if (previousTarget === undefined) delete process.env.WEB_API_PROXY_TARGET
    else process.env.WEB_API_PROXY_TARGET = previousTarget
    context.after(() => server.close())
    await server.listen()
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`
    await routeMatrix(origin)
    const document = await fetch(origin)
    const policy = document.headers.get('content-security-policy')
    assert.match(policy, /nonce-lef-vite-development-only/)
    assert.match(policy, /ws:\/\/localhost:\*/)
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/)
    const html = await document.text()
    assert.match(html, /nonce="lef-vite-development-only"/)
})

test('Nginx image preserves routing, static security, caching, health, and private logs', { timeout: 120_000 }, async (context) => {
    const unique = `lef-gateway-${process.pid}-${Date.now()}`
    const network = unique
    const networkOwnerName = `${unique}-network`
    const backendName = `${unique}-api`
    const gatewayName = `${unique}-web`
    const temporary = await mkdtemp(join(tmpdir(), 'lef-gateway-'))
    const created = []
    context.after(async () => {
        for (const name of created.reverse()) await docker('rm', '--force', name)
        await docker('network', 'rm', network)
        await rm(temporary, { recursive: true, force: true })
    })
    await docker('network', 'create', network)
    await writeFile(join(temporary, 'fixture.mjs'), `import { createServer } from 'node:http';\ncreateServer(${fixture.toString()}).listen(3000, '0.0.0.0');\n`)
    // Keep the network endpoint alive after the API stops so the failed request
    // gets a refused connection rather than timing out against a removed endpoint.
    await docker('run', '--detach', '--name', networkOwnerName, '--network', network, '--network-alias', 'api', 'node:24-alpine', 'node', '-e', 'setInterval(() => {}, 1_000)')
    created.push(networkOwnerName)
    await docker('run', '--detach', '--name', backendName, '--network', `container:${networkOwnerName}`, '--mount', `type=bind,src=${temporary},dst=/fixture,readonly`, 'node:24-alpine', 'node', '/fixture/fixture.mjs')
    created.push(backendName)
    await docker('run', '--detach', '--name', gatewayName, '--network', network, '--publish', '127.0.0.1::8080', image)
    created.push(gatewayName)
    const port = await docker('port', gatewayName, '8080/tcp')
    const origin = `http://${port}`
    await waitForReady(origin)
    assert.equal(await docker('exec', gatewayName, 'id', '-u'), '101')
    await docker('exec', gatewayName, 'nginx', '-t')
    await routeMatrix(origin)
    const document = await fetch(origin)
    assertSecurityHeaders(document)
    assert.equal(document.headers.get('cache-control'), 'no-cache')
    const html = await document.text()
    assert.doesNotMatch(html, /<style\b|\sstyle=|<script(?![^>]*\bsrc=)/i)
    assert.doesNotMatch(html, /lef-vite-development-only/)
    const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map((match) => match[1])
    assert.ok(assets.length >= 2)
    for (const path of assets) {
        const asset = await fetch(`${origin}${path}`)
        assert.equal(asset.status, 200)
        assertSecurityHeaders(asset)
        assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    }
    const missingAsset = await fetch(`${origin}/assets/${marker}.js`)
    assert.equal(missingAsset.status, 404)
    assertSecurityHeaders(missingAsset)
    assert.notEqual(missingAsset.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    await fetch(`${origin}/emails/${marker}@example.test`)
    await fetch(`${origin}/v1/organizations/invitations/${marker}`)
    await fetch(`${origin}/accept-invitation/${marker}`)
    const oversized = await fetch(`${origin}/ui/${marker}?query=${marker}`, { method: 'POST', body: marker.repeat(100_000) })
    assert.equal(oversized.status, 413)
    await fetch(`${origin}/ui/${marker}`, { method: marker })
    const malformed = await fetch(`${origin}/%ZZ${marker}?query=${marker}`)
    assert.equal(malformed.status, 400)
    // Static availability remains independent after the API disappears.
    await docker('stop', backendName)
    await docker('exec', gatewayName, 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:8081/health')
    assert.equal((await fetch(`${origin}/`)).status, 200)
    assert.equal((await fetch(`${origin}/v1/${marker}?query=${marker}`)).status, 502)
    const { stdout, stderr } = await execFile('docker', ['logs', gatewayName])
    const logs = stdout + stderr
    assert.ok(!logs.includes(marker), 'Gateway logs must omit private input even on errors')
    const records = stdout.trim().split('\n').map((line) => JSON.parse(line))
    for (const record of records) {
        assert.deepEqual(Object.keys(record).sort(), ['method', 'path', 'requestId', 'status'])
        assert.match(record.requestId, /^[a-f0-9]{32}$/)
    }
    for (const path of ['/v1/auth/callback', '/emails/:sensitive', '/v1/organizations/invitations/:sensitive', '/accept-invitation/:sensitive']) {
        assert.ok(records.some((record) => record.path === path), `Missing fixed route ${path}`)
    }
    assert.ok(records.some((record) => record.status === 502))
    assert.ok(records.some((record) => record.status === 413))
    assert.ok(records.some((record) => record.method === 'OTHER'))
    const imageConfiguration = JSON.parse(await docker('image', 'inspect', image))[0].Config
    assert.ok(imageConfiguration.Healthcheck.Test.join(' ').includes('127.0.0.1:8081/health'))
    const nginxConfig = await readFile(join(repository, 'docker/web/nginx.conf'), 'utf8')
    assert.ok(!nginxConfig.includes('$request_uri'))
})
