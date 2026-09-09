import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
process.env.LEF_VERIFICATION_TEST_PRIVACY = '1'

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: 'batch-verification.spec.ts',
    fullyParallel: false,
    forbidOnly: true,
    workers: 1,
    retries: 0,
    timeout: 120_000,
    reporter: './tests/support/browser-fixture-reporter.ts',
    outputDir: process.env.BROWSER_FIXTURE_OUTPUT ?? join(tmpdir(), 'lef-batch-verification-browser-results'),
    use: {
        browserName: 'chromium',
        channel: 'chromium',
        locale: 'en-US',
        viewport: { width: 1440, height: 900 },
        trace: 'off',
        screenshot: 'off',
        video: 'off',
    },
    projects: [{ name: 'chromium' }],
})
