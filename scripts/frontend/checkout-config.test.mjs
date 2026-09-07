import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
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
