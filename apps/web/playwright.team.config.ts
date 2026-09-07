import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'
process.env.LEF_INVITATION_TEST_PRIVACY = '1'
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: 'team-and-invitations.spec.ts',
    fullyParallel: false,
    forbidOnly: true,
    workers: 1,
    retries: 0,
    timeout: 90_000,
    reporter: './tests/support/invitation-reporter.ts',
    outputDir: process.env.INVITATION_OUTPUT_DIR ?? join(tmpdir(), 'lef-team-live-results'),
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
