import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'
import { resolveCheckoutAllowedOrigins } from '../../src/libs/common/src/checkout-redirect.ts'

const execFile = promisify(execFileCallback)
const root = resolve(import.meta.dirname, '../..')
const webRoot = resolve(root, 'apps/web')
const webRequire = createRequire(resolve(webRoot, 'package.json'))
const vite = resolve(webRequire.resolve('vite/package.json'), '../bin/vite.js')

test('resolved Compose uses identical server and browser checkout policy inputs', async () => {
    for (const paddle of [false, true]) {
        const args = ['compose', '-f', 'docker/compose.yaml']
        if (paddle) args.push('-f', 'docker/compose.paddle-dev.yaml')
        args.push('config', '--format', 'json')
        const { stdout } = await execFile('docker', args, {
            cwd: root,
            env: {
                ...process.env,
                WEB_PORT: '53105',
                PADDLE_STARTER_PRICE_ID: 'pri_config_fixture',
                PAYMENTS_CHECKOUT_ALLOWED_ORIGINS: 'https://CHECKOUT.PADDLE.COM:443/,http://localhost:57000',
            },
        })
        const { services } = JSON.parse(stdout)
        const api = services.api.environment
        const web = services.web.build.args
        for (const key of ['PAYMENTS_PROVIDER', 'PAYMENTS_CHECKOUT_URL', 'PAYMENTS_CHECKOUT_ALLOWED_ORIGINS']) {
            assert.equal(api[key], web[key], key)
        }
        const normalize = env =>
            resolveCheckoutAllowedOrigins({
                provider: env.PAYMENTS_PROVIDER,
                checkoutUrl: env.PAYMENTS_CHECKOUT_URL,
                allowedOrigins: env.PAYMENTS_CHECKOUT_ALLOWED_ORIGINS,
            })
        assert.deepEqual(normalize(api), normalize(web))
        assert.deepEqual(
            normalize(api),
            paddle ? ['http://localhost:57000', 'https://checkout.paddle.com'] : ['http://localhost:53105'],
        )
        assert.deepEqual(Object.keys(web).sort(), [
            'PAYMENTS_CHECKOUT_ALLOWED_ORIGINS',
            'PAYMENTS_CHECKOUT_URL',
            'PAYMENTS_PROVIDER',
        ])
        if (paddle) assert.equal(services['paddle-checkout'].environment.WEB_PORT, '53105')
    }
})

async function rendererFixture(run) {
    const directory = await mkdtemp(resolve(tmpdir(), 'lef-paddle-renderer-'))
    try {
        const bin = resolve(directory, 'bin')
        const outputFile = resolve(directory, 'checkout.html')
        const marker = resolve(directory, 'nginx-started')
        const token = 'test_synthetic_renderer_token'
        await mkdir(bin)
        await writeFile(resolve(directory, 'client-token'), token, { mode: 0o600 })
        await writeFile(resolve(bin, 'nginx'), '#!/bin/sh\nprintf started > "$LEF_RENDERER_START_MARKER"\n')
        await chmod(resolve(bin, 'nginx'), 0o700)
        const template = await readFile(resolve(root, 'docker/paddle-dev/checkout.html.template'), 'utf8')
        await writeFile(resolve(directory, 'checkout.html.template'), template)
        // Replace filesystem locations only: validation, export, envsubst, and startup remain the real shell code.
        const source = await readFile(resolve(root, 'docker/paddle-dev/render-checkout.sh'), 'utf8')
        const script = source
            .replaceAll('/run/secrets/paddle_client_token', resolve(directory, 'client-token'))
            .replaceAll('/paddle-dev/checkout.html.template', resolve(directory, 'checkout.html.template'))
            .replaceAll('/usr/share/nginx/html/checkout.html', outputFile)
        const scriptFile = resolve(directory, 'render-checkout.sh')
        await writeFile(scriptFile, script)
        await run({
            token,
            outputFile,
            marker,
            async render(port) {
                const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, LEF_RENDERER_START_MARKER: marker }
                delete env.WEB_PORT
                // Ambient values must never substitute for the configured local application return destination.
                env.PADDLE_CHECKOUT_SUCCESS_URL = 'https://untrusted.example/private-return-marker'
                if (port !== undefined) env.WEB_PORT = port
                return execFile('/bin/sh', [scriptFile], { env, timeout: 10_000 })
            },
        })
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
}

function initializedCheckout(html) {
    const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    assert.ok(inline, 'The fixture must initialize Paddle from its rendered inline script')
    let settings
    let environment
    const location = {
        href: 'http://localhost:57000/checkout.html?_ptxn=txn_fixture&successUrl=https%3A%2F%2Funtrusted.example&returnUrl=https%3A%2F%2Funtrusted.example',
        search: '?_ptxn=txn_fixture&successUrl=https%3A%2F%2Funtrusted.example&returnUrl=https%3A%2F%2Funtrusted.example',
    }
    runInNewContext(inline, {
        location,
        URL,
        URLSearchParams,
        window: {
            location,
            addEventListener(name, listener) {
                assert.equal(name, 'DOMContentLoaded')
                listener()
            },
        },
        Paddle: {
            Environment: {
                set(value) {
                    environment = value
                },
            },
            Initialize(value) {
                settings = JSON.parse(JSON.stringify(value))
            },
        },
    })
    assert.equal(environment, 'sandbox')
    return settings
}

test('Paddle renderer configures default and custom billing return URLs without query overrides', async () => {
    for (const [port, expectedPort] of [
        [undefined, '53000'],
        ['', '53000'],
        ['53105', '53105'],
        ['1', '1'],
        ['65535', '65535'],
    ]) {
        await rendererFixture(async ({ render, outputFile, marker, token }) => {
            const result = await render(port)
            assert.equal(result.stdout, '')
            assert.equal(result.stderr, '')
            assert.equal(await readFile(marker, 'utf8'), 'started')
            const html = await readFile(outputFile, 'utf8')
            assert.doesNotMatch(html, /\$\{PADDLE_(?:CLIENT_TOKEN|CHECKOUT_SUCCESS_URL)\}|private-return-marker/)
            const initialization = initializedCheckout(html)
            assert.equal(initialization.token, token)
            assert.deepEqual(initialization.checkout.settings, {
                displayMode: 'overlay',
                theme: 'light',
                locale: 'en',
                successUrl: `http://localhost:${expectedPort}/billing/complete`,
            })
        })
    }
})

test('Paddle renderer rejects invalid application ports before rendering or starting nginx', async () => {
    for (const port of [
        '0',
        '65536',
        '999999999999999999999999',
        '-1',
        '1.5',
        '53105/private-port-marker',
        '53105?status=paid',
        '53105;echo private-port-marker',
        ' 53105',
        '53105\n',
    ]) {
        await rendererFixture(async ({ render, outputFile, marker, token }) => {
            await assert.rejects(render(port), error => {
                assert.equal(error.code, 1)
                assert.match(error.stderr, /WEB_PORT/)
                assert.equal(error.stdout, '')
                assert.ok(!error.stderr.includes(token))
                assert.doesNotMatch(error.stderr, /private-port-marker|status=paid/)
                return true
            })
            await assert.rejects(readFile(outputFile), { code: 'ENOENT' })
            await assert.rejects(readFile(marker), { code: 'ENOENT' })
        })
    }
})

test('Paddle web builds fail on missing or malformed origins without revealing input', async () => {
    for (const origins of ['', 'https://private-marker:secret@example.com']) {
        await assert.rejects(
            execFile(process.execPath, [vite, 'build'], {
                cwd: webRoot,
                env: { ...process.env, PAYMENTS_PROVIDER: 'paddle', PAYMENTS_CHECKOUT_ALLOWED_ORIGINS: origins },
            }),
            error => {
                assert.match(error.stderr, /Checkout/)
                assert.doesNotMatch(error.stderr, /private-marker|secret@example/)
                return true
            },
        )
    }
})

test('web build embeds only normalized origins and excludes unrelated payment configuration', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'lef-checkout-build-'))
    try {
        await execFile(process.execPath, [vite, 'build', '--outDir', directory], {
            cwd: webRoot,
            env: {
                ...process.env,
                PAYMENTS_PROVIDER: 'paddle',
                PAYMENTS_CHECKOUT_ALLOWED_ORIGINS: 'https://BILLING.EXAMPLE:443/',
                PAYMENTS_CHECKOUT_URL: 'https://private-return-marker.example/checkout',
                PADDLE_API_KEY: 'private-api-key-marker',
                PADDLE_WEBHOOK_SECRET: 'private-webhook-marker',
                PAYMENTS_CREDIT_PACKS: 'private-catalog-marker',
            },
        })
        const assets = await readdir(resolve(directory, 'assets'))
        const script = (
            await Promise.all(
                assets
                    .filter(name => name.endsWith('.js'))
                    .map(name => readFile(resolve(directory, 'assets', name), 'utf8')),
            )
        ).join('\n')
        assert.match(script, /https:\/\/billing\.example/)
        assert.doesNotMatch(
            script,
            /private-(?:return-marker|api-key-marker|webhook-marker|catalog-marker)|BILLING\.EXAMPLE:443/,
        )
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})
