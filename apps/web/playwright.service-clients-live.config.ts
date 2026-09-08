import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
process.env.LEF_SERVICE_CLIENT_TEST_PRIVACY = '1'

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: 'service-clients.spec.ts',
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    timeout: 120_000,
    reporter: './tests/support/service-client-reporter.ts',
    outputDir: process.env.SERVICE_CLIENT_OUTPUT_DIR ?? join(tmpdir(), 'lef-service-client-live-results'),
    use: {
        browserName: 'chromium',
        channel: 'chromium',
        locale: 'en-US',
        viewport: { width: 1440, height: 900 },
        trace: 'off',
        screenshot: 'off',
        video: 'off',
        launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
    },
    projects: [{ name: 'chromium' }],
})
