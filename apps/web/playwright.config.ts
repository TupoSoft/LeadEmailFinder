import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'

const port = 4173
const privacyPolicies = {
    authentication: {
        flag: undefined,
        reporter: './tests/support/browser-fixture-reporter.ts',
        outputVariable: 'BROWSER_FIXTURE_OUTPUT',
    },
    invitation: {
        flag: 'LEF_INVITATION_TEST_PRIVACY',
        reporter: './tests/support/invitation-reporter.ts',
        outputVariable: 'INVITATION_OUTPUT_DIR',
    },
    verification: {
        flag: 'LEF_VERIFICATION_TEST_PRIVACY',
        reporter: './tests/support/browser-fixture-reporter.ts',
        outputVariable: 'BROWSER_FIXTURE_OUTPUT',
    },
    serviceClient: {
        flag: 'LEF_SERVICE_CLIENT_TEST_PRIVACY',
        reporter: './tests/support/service-client-reporter.ts',
        outputVariable: 'SERVICE_CLIENT_OUTPUT_DIR',
    },
    proxy: {
        flag: 'LEF_PROXY_TEST_PRIVACY',
        reporter: './tests/support/platform-proxy-reporter.ts',
        outputVariable: 'PROXY_OUTPUT_DIR',
    },
}

interface SensitiveSuite {
    testMatch: string
    privacy: keyof typeof privacyPolicies
    outputDirectory: string
    timeout?: number
    previewPort?: number
    reuseExistingServer?: boolean
    backForwardCache?: boolean
    reporter?: string
}

const sensitiveSuites: Record<string, SensitiveSuite | undefined> = {
    privileged: {
        testMatch: 'privileged-*.spec.ts',
        privacy: 'authentication',
        outputDirectory: 'lef-privileged-browser-results',
        timeout: 90_000,
    },
    billing: {
        testMatch: 'billing.spec.ts',
        privacy: 'authentication',
        outputDirectory: 'lef-billing-browser-results',
        timeout: 90_000,
    },
    verification: {
        testMatch: 'single-verification.spec.ts',
        privacy: 'verification',
        outputDirectory: 'lef-single-verification-browser-results',
        timeout: 120_000,
    },
    'batch-verification': {
        testMatch: 'batch-verification.spec.ts',
        privacy: 'verification',
        outputDirectory: 'lef-batch-verification-browser-results',
        timeout: 120_000,
    },
    'verification-billing': {
        testMatch: 'verification-billing.spec.ts',
        privacy: 'verification',
        outputDirectory: 'lef-verification-billing-results',
        timeout: 120_000,
        reporter: '../../scripts/testing/verification-billing-web.mjs',
    },
    invitation: {
        testMatch: 'invitations-ui.spec.ts',
        privacy: 'invitation',
        outputDirectory: 'lef-invitation-results',
        previewPort: port,
        backForwardCache: true,
    },
    team: {
        testMatch: 'team-and-invitations.spec.ts',
        privacy: 'invitation',
        outputDirectory: 'lef-team-live-results',
        timeout: 90_000,
        backForwardCache: true,
    },
    'platform-organizations': {
        testMatch: 'platform-organizations-ui.spec.ts',
        privacy: 'invitation',
        outputDirectory: 'lef-platform-organizations-results',
        previewPort: port,
        backForwardCache: true,
    },
    'platform-organizations-live': {
        testMatch: 'platform-organizations.spec.ts',
        privacy: 'invitation',
        outputDirectory: 'lef-platform-organizations-live-results',
        timeout: 90_000,
        backForwardCache: true,
    },
    'platform-credits': {
        testMatch: 'platform-credits-ui.spec.ts',
        privacy: 'invitation',
        outputDirectory: 'lef-platform-credits-results',
        previewPort: port,
        backForwardCache: true,
    },
    'platform-credits-live': {
        testMatch: 'platform-credits.spec.ts',
        privacy: 'invitation',
        outputDirectory: 'lef-platform-credits-live-results',
        timeout: 120_000,
    },
    'service-clients': {
        testMatch: 'service-clients-ui.spec.ts',
        privacy: 'serviceClient',
        outputDirectory: 'lef-service-client-results',
        previewPort: port,
        backForwardCache: true,
    },
    'service-clients-live': {
        testMatch: 'service-clients.spec.ts',
        privacy: 'serviceClient',
        outputDirectory: 'lef-service-client-live-results',
        timeout: 120_000,
        backForwardCache: true,
    },
    'platform-proxies': {
        testMatch: 'platform-proxies-ui.spec.ts',
        privacy: 'proxy',
        outputDirectory: 'lef-platform-proxy-results',
        previewPort: Number(process.env.PROXY_BROWSER_PORT ?? 41739),
        reuseExistingServer: false,
        backForwardCache: true,
    },
    'platform-proxies-live': {
        testMatch: 'platform-proxies.spec.ts',
        privacy: 'proxy',
        outputDirectory: 'lef-platform-proxy-live-results',
        timeout: 120_000,
        backForwardCache: true,
    },
}

const viewportProjects = [
    { name: 'desktop-chromium', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'narrow-chromium', use: { viewport: { width: 320, height: 720 } } },
]

// LEF_PLAYWRIGHT_SUITE selects one run-wide reporter, server setup, and privacy policy.
// With no selector, only the ordinary screenshot-enabled UI suites are discovered.
export function createPlaywrightConfig(suiteName = 'ui'): PlaywrightTestConfig {
    if (suiteName === 'ui') {
        return defineConfig({
            testDir: './tests/e2e',
            testIgnore: [
                'privileged-*.spec.ts',
                'billing.spec.ts',
                'single-verification.spec.ts',
                'batch-verification.spec.ts',
                'verification-billing.spec.ts',
                'invitations-ui.spec.ts',
                'platform-organizations-ui.spec.ts',
                'platform-organizations.spec.ts',
                'platform-credits-ui.spec.ts',
                'platform-credits.spec.ts',
                'team-and-invitations.spec.ts',
                'service-clients-ui.spec.ts',
                'service-clients.spec.ts',
                'platform-proxies-ui.spec.ts',
                'platform-proxies.spec.ts',
            ],
            fullyParallel: true,
            forbidOnly: Boolean(process.env.CI),
            retries: process.env.CI ? 2 : 0,
            workers: process.env.CI ? 2 : undefined,
            reporter: 'list',
            outputDir: 'test-results',
            expect: {
                toHaveScreenshot: {
                    animations: 'disabled',
                    caret: 'hide',
                    maxDiffPixelRatio: 0.005,
                },
            },
            use: {
                baseURL: `http://127.0.0.1:${port}`,
                browserName: 'chromium',
                channel: 'chromium',
                colorScheme: 'light',
                locale: 'en-US',
                screenshot: 'only-on-failure',
                trace: 'retain-on-failure',
            },
            webServer: {
                command: `pnpm preview --host 127.0.0.1 --port ${port}`,
                url: `http://127.0.0.1:${port}`,
                reuseExistingServer: !process.env.CI,
                timeout: 30_000,
            },
            projects: viewportProjects,
        })
    }

    if (suiteName === 'gateway') {
        return defineConfig({
            testDir: './tests/gateway',
            fullyParallel: false,
            forbidOnly: true,
            retries: 0,
            workers: 1,
            timeout: 60_000,
            reporter: [['json', { outputFile: process.env.WEB_LIVE_REPORT }]],
            outputDir: process.env.WEB_LIVE_OUTPUT ?? join(tmpdir(), 'lef-web-live-results'),
            use: {
                baseURL: process.env.WEB_LIVE_ORIGIN ?? 'http://localhost:53000',
                browserName: 'chromium',
                channel: 'chromium',
                viewport: { width: 1440, height: 900 },
                locale: 'en-US',
                // Authentication artifacts must never retain passwords, cookies, or callback URLs.
                trace: 'off',
                screenshot: 'off',
                video: 'off',
            },
        })
    }

    const suite = Object.hasOwn(sensitiveSuites, suiteName) ? sensitiveSuites[suiteName] : undefined
    if (!suite) {
        throw new Error(
            `Unknown LEF_PLAYWRIGHT_SUITE. Choose ui, gateway, or one of: ${Object.keys(sensitiveSuites).join(', ')}.`,
        )
    }

    const policy = privacyPolicies[suite.privacy]
    const previewPort = suite.previewPort
    return defineConfig({
        testDir: './tests/e2e',
        testMatch: suite.testMatch,
        fullyParallel: false,
        forbidOnly: true,
        workers: 1,
        retries: 0,
        ...(suite.timeout !== undefined ? { timeout: suite.timeout } : {}),
        reporter: suite.reporter ?? policy.reporter,
        outputDir: process.env[policy.outputVariable] ?? join(tmpdir(), suite.outputDirectory),
        use: {
            ...(previewPort !== undefined ? { baseURL: `http://127.0.0.1:${previewPort}` } : {}),
            browserName: 'chromium',
            channel: 'chromium',
            locale: 'en-US',
            ...(previewPort === undefined ? { viewport: { width: 1440, height: 900 } } : {}),
            trace: 'off',
            screenshot: 'off',
            video: 'off',
            ...(suite.backForwardCache
                ? { launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] } }
                : {}),
        },
        ...(previewPort !== undefined
            ? {
                  webServer: {
                      command: `pnpm preview --host 127.0.0.1 --port ${previewPort}`,
                      url: `http://127.0.0.1:${previewPort}`,
                      reuseExistingServer: suite.reuseExistingServer ?? !process.env.CI,
                  },
              }
            : {}),
        projects: previewPort === undefined ? [{ name: 'chromium' }] : viewportProjects,
    })
}

const suiteName = process.env.LEF_PLAYWRIGHT_SUITE ?? 'ui'
const configuration = createPlaywrightConfig(suiteName)

// These flags are process-wide. Never inherit another suite's sanitizer or snapshot policy.
for (const { flag } of Object.values(privacyPolicies)) {
    if (flag) delete process.env[flag]
}
const selectedSuite = sensitiveSuites[suiteName]
if (selectedSuite) {
    process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
    const flag = privacyPolicies[selectedSuite.privacy].flag
    if (flag) process.env[flag] = '1'
} else {
    delete process.env.PLAYWRIGHT_NO_COPY_PROMPT
}

export default configuration
