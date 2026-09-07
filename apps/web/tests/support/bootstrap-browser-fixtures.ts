import { chromium } from '@playwright/test'
import { browserFixtureEnvironment } from './browser-fixture-environment.ts'
import {
    browserFixtureError,
    readBrowserFixtureMetadata,
    writeBrowserFixtureMetadata,
    type BrowserFixtureMetadata,
} from './browser-fixture-metadata.ts'
import { hostedMfaLogin, signOutFixture } from './hosted-mfa-login.ts'

async function main() {
    const environment = await browserFixtureEnvironment()
    const { repositoryRoot, seed, origin } = environment
    const existing = await readBrowserFixtureMetadata(repositoryRoot, seed)
    const metadata: BrowserFixtureMetadata = existing ?? {
        version: 1,
        resetId: seed.resetId,
        users: {
            owner: { email: seed.users.owner.email, subject: seed.users.owner.subject, totpSecret: '' },
            platformOperator: {
                email: seed.users.platformOperator.email,
                subject: seed.users.platformOperator.subject,
                totpSecret: '',
            },
        },
    }
    const browser = await chromium.launch({ channel: 'chromium' })
    try {
        for (const identity of ['owner', 'platformOperator'] as const) {
            const context = await browser.newContext({ baseURL: origin, locale: 'en-US' })
            try {
                const page = await context.newPage()
                page.setDefaultTimeout(15_000)
                metadata.users[identity].totpSecret = await hostedMfaLogin({
                    ...environment,
                    page,
                    identity,
                    secret: existing?.users[identity].totpSecret,
                })
                await signOutFixture(page)
            } finally {
                await context.close()
            }
        }
        // Commit only after both real account assertions and application sign-outs succeed.
        if (!existing) await writeBrowserFixtureMetadata(repositoryRoot, metadata, seed)
        console.log('owner: PASS\nplatformOperator: PASS')
    } finally {
        await browser.close()
    }
}

void main().catch(() => {
    console.error(`Browser fixtures: FAIL. ${browserFixtureError().message}`)
    process.exitCode = 1
})
