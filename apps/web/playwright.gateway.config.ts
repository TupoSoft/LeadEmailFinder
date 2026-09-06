import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

export default defineConfig({
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
