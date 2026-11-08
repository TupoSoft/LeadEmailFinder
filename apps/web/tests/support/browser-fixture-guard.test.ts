// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPlaywrightConfig } from '../../playwright.config'

const root = resolve(import.meta.dirname, '../../../..')
const fixtureSuites = [
    ['privileged', 'privileged-*.spec.ts'],
    ['billing', 'billing.spec.ts'],
    ['verification', 'single-verification.spec.ts'],
    ['batch-verification', 'batch-verification.spec.ts'],
    ['verification-billing', 'verification-billing.spec.ts'],
    ['invitation', 'invitations-ui.spec.ts'],
    ['team', 'team-and-invitations.spec.ts'],
    ['platform-organizations', 'platform-organizations-ui.spec.ts'],
    ['platform-organizations-live', 'platform-organizations.spec.ts'],
    ['platform-credits', 'platform-credits-ui.spec.ts'],
    ['platform-credits-live', 'platform-credits.spec.ts'],
    ['service-clients', 'service-clients-ui.spec.ts'],
    ['service-clients-live', 'service-clients.spec.ts'],
    ['platform-proxies', 'platform-proxies-ui.spec.ts'],
    ['platform-proxies-live', 'platform-proxies.spec.ts'],
] as const
const previewSuites = new Set([
    'invitation',
    'platform-organizations',
    'platform-credits',
    'service-clients',
    'platform-proxies',
])
const privacyFlags = [
    'LEF_INVITATION_TEST_PRIVACY',
    'LEF_VERIFICATION_TEST_PRIVACY',
    'LEF_SERVICE_CLIENT_TEST_PRIVACY',
    'LEF_PROXY_TEST_PRIVACY',
] as const

afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
})

describe('privileged browser fixture integration boundaries', () => {
    it.each(fixtureSuites)('isolates the %s suite without authentication artifacts or retries', (suite, testMatch) => {
        const configuration = createPlaywrightConfig(suite)
        expect(configuration.testDir).toBe('./tests/e2e')
        expect(configuration.testMatch).toBe(testMatch)
        expect(configuration.use).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' })
        expect(configuration.retries).toBe(0)
        expect(configuration.workers).toBe(1)
        expect(configuration.fullyParallel).toBe(false)
        expect(configuration.forbidOnly).toBe(true)
        if (previewSuites.has(suite)) {
            expect(configuration.webServer).toBeDefined()
            expect(configuration.projects?.map(project => project.name)).toEqual([
                'desktop-chromium',
                'narrow-chromium',
            ])
        } else {
            expect(configuration.webServer).toBeUndefined()
            expect(configuration.projects).toHaveLength(1)
        }
    })

    it('keeps sensitive suites out of the default UI run', () => {
        const normal = createPlaywrightConfig()
        expect(normal.testIgnore).toEqual(expect.arrayContaining(fixtureSuites.map(([, testMatch]) => testMatch)))
        expect(normal.testDir).toBe('./tests/e2e')
        expect(normal.use).toMatchObject({ screenshot: 'only-on-failure', trace: 'retain-on-failure' })
        expect(normal.webServer).toBeDefined()
    })

    it('keeps gateway validation on its existing stack with private JSON diagnostics', () => {
        const gateway = createPlaywrightConfig('gateway')
        expect(gateway.testDir).toBe('./tests/gateway')
        expect(gateway.webServer).toBeUndefined()
        expect(gateway.use).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' })
        expect(gateway.reporter).toEqual([['json', { outputFile: process.env.WEB_LIVE_REPORT }]])
        expect(gateway.retries).toBe(0)
        expect(gateway.workers).toBe(1)
    })

    it.each(['', 'unknown-suite', 'toString', '__proto__'])('rejects an invalid suite %j', suite => {
        expect(() => createPlaywrightConfig(suite)).toThrow()
    })

    it('preserves the longer live verification deadlines and invitation restoration coverage', () => {
        expect(createPlaywrightConfig('billing').timeout).toBe(90_000)
        expect(createPlaywrightConfig('batch-verification').timeout).toBe(120_000)
        expect(createPlaywrightConfig('invitation').use?.launchOptions).toEqual({
            ignoreDefaultArgs: ['--disable-back-forward-cache'],
        })
    })

    it.each([
        ['privileged', './tests/support/browser-fixture-reporter.ts'],
        ['billing', './tests/support/browser-fixture-reporter.ts'],
        ['verification', './tests/support/browser-fixture-reporter.ts'],
        ['batch-verification', './tests/support/browser-fixture-reporter.ts'],
        ['verification-billing', '../../scripts/testing/verification-billing-web.mjs'],
        ['invitation', './tests/support/invitation-reporter.ts'],
        ['team', './tests/support/invitation-reporter.ts'],
        ['platform-organizations', './tests/support/invitation-reporter.ts'],
        ['platform-organizations-live', './tests/support/invitation-reporter.ts'],
        ['platform-credits', './tests/support/invitation-reporter.ts'],
        ['platform-credits-live', './tests/support/invitation-reporter.ts'],
    ])('uses the restricted reporter for %s', (suite, reporter) => {
        expect(createPlaywrightConfig(suite).reporter).toBe(reporter)
    })

    it.each([
        ['ui', undefined],
        ['gateway', undefined],
        ['billing', undefined],
        ['invitation', 'LEF_INVITATION_TEST_PRIVACY'],
        ['verification', 'LEF_VERIFICATION_TEST_PRIVACY'],
        ['service-clients', 'LEF_SERVICE_CLIENT_TEST_PRIVACY'],
        ['platform-proxies', 'LEF_PROXY_TEST_PRIVACY'],
    ])('selects only the %s privacy policy before tests load', async (suite, selectedFlag) => {
        vi.stubEnv('LEF_PLAYWRIGHT_SUITE', suite)
        vi.stubEnv('PLAYWRIGHT_NO_COPY_PROMPT', '1')
        for (const flag of privacyFlags) vi.stubEnv(flag, '1')
        vi.resetModules()

        const { default: configuration } = await import('../../playwright.config')

        expect(configuration.testDir).toBe(suite === 'gateway' ? './tests/gateway' : './tests/e2e')
        for (const flag of privacyFlags) {
            expect(process.env[flag]).toBe(flag === selectedFlag ? '1' : undefined)
        }
        expect(process.env.PLAYWRIGHT_NO_COPY_PROMPT).toBe(suite === 'ui' || suite === 'gateway' ? undefined : '1')
    })

    it('fails closed when the environment selects an unknown suite', async () => {
        vi.stubEnv('LEF_PLAYWRIGHT_SUITE', 'unknown-suite')
        vi.resetModules()
        await expect(import('../../playwright.config')).rejects.toThrow()
    })

    it('isolates service-client suites before any secret-bearing test can run', () => {
        for (const suite of ['service-clients', 'service-clients-live']) {
            const configuration = createPlaywrightConfig(suite)
            expect(configuration.use).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' })
            expect(configuration.retries).toBe(0)
            expect(configuration.workers).toBe(1)
            expect(configuration.reporter).toBe('./tests/support/service-client-reporter.ts')
        }
        for (const suite of ['service-clients-ui.spec.ts', 'service-clients.spec.ts']) {
            const source = readFileSync(resolve(root, 'apps/web/tests/e2e', suite), 'utf8')
            expect(source).toMatch(/from ['"]\.\.\/support\/privileged-login['"]/)
            expect(source).not.toMatch(/storageState|addCookies|client_credentials|saveAs|\.screenshot\(|\.attach\(/)
        }
    })

    it('isolates proxy credential suites before entering any credential', () => {
        for (const suite of ['platform-proxies', 'platform-proxies-live']) {
            const configuration = createPlaywrightConfig(suite)
            expect(configuration.use).toMatchObject({ trace: 'off', screenshot: 'off', video: 'off' })
            expect(configuration.retries).toBe(0)
            expect(configuration.workers).toBe(1)
            expect(configuration.reporter).toBe('./tests/support/platform-proxy-reporter.ts')
        }
        for (const suite of ['platform-proxies-ui.spec.ts', 'platform-proxies.spec.ts']) {
            const source = readFileSync(resolve(root, 'apps/web/tests/e2e', suite), 'utf8')
            expect(source).toMatch(/from ['"]\.\.\/support\/privileged-login['"]/)
            expect(source).not.toMatch(/storageState|addCookies|client_credentials|saveAs|\.screenshot\(|\.attach\(/)
        }
    })

    it('requires the shared fixture in privileged suites and prohibits synthetic authentication', () => {
        const e2e = resolve(root, 'apps/web/tests/e2e')
        const suites = readdirSync(e2e).filter(
            name =>
                /^privileged-.*\.spec\.ts$/.test(name) ||
                name === 'billing.spec.ts' ||
                name === 'single-verification.spec.ts',
        )
        expect(suites.length).toBeGreaterThan(0)
        for (const suite of suites) {
            const source = readFileSync(resolve(e2e, suite), 'utf8')
            expect(source).toMatch(/from ['"]\.\.\/support\/privileged-login['"]/)
            expect(source).not.toMatch(
                /storageState|addCookies|client_credentials|clientSecret|\.route\(|reset-password/,
            )
        }
    })

    it('keeps TOTP and fixture material out of production web sources', () => {
        const inspect = (directory: string): void => {
            for (const entry of readdirSync(directory, { withFileTypes: true })) {
                const file = resolve(directory, entry.name)
                if (entry.isDirectory()) inspect(file)
                else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
                    expect(readFileSync(file, 'utf8')).not.toMatch(
                        /browser-fixture|totpSecret|generateTotp|OWNER_PASSWORD|OPERATOR_PASSWORD/,
                    )
                }
            }
        }
        inspect(resolve(root, 'apps/web/src'))
    })
})
