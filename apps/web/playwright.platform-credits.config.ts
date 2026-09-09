import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
process.env.LEF_INVITATION_TEST_PRIVACY = '1'

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: 'platform-credits-ui.spec.ts',
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    reporter: './tests/support/invitation-reporter.ts',
    outputDir: process.env.INVITATION_OUTPUT_DIR ?? join(tmpdir(), 'lef-platform-credits-results'),
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        channel: 'chromium',
        locale: 'en-US',
        trace: 'off',
        screenshot: 'off',
        video: 'off',
        launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
    },
    webServer: {
        command: 'pnpm preview --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
    },
    projects: [
        { name: 'desktop-chromium', use: { viewport: { width: 1440, height: 900 } } },
        { name: 'narrow-chromium', use: { viewport: { width: 320, height: 720 } } },
    ],
})
