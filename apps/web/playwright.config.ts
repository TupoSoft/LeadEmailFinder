import { defineConfig } from '@playwright/test'

const port = 4173

export default defineConfig({
    testDir: './tests/e2e',
    testIgnore: [
        'privileged-*.spec.ts',
        'billing.spec.ts',
        'single-verification.spec.ts',
        'invitations-ui.spec.ts',
        'team-and-invitations.spec.ts',
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
    projects: [
        {
            name: 'desktop-chromium',
            use: { viewport: { width: 1440, height: 900 } },
        },
        {
            name: 'narrow-chromium',
            use: { viewport: { width: 320, height: 720 } },
        },
    ],
})
