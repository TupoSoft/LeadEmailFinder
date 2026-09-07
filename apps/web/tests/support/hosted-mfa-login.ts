import type { Page } from '@playwright/test'
import {
    CUSTOMER_OWNER_PASSWORD,
    PLATFORM_OPERATOR_PASSWORD,
} from '../../../../scripts/keycloak/browser-fixture-identities.ts'
import {
    browserFixtureError,
    type BrowserFixtureIdentity,
    type BrowserSeedMetadata,
} from './browser-fixture-metadata.ts'
import { assertTotpSecret, generateTotp } from './totp.ts'

interface LoginOptions {
    page: Page
    identity: BrowserFixtureIdentity
    origin: string
    seed: BrowserSeedMetadata
    secret?: string
    now?: () => number
    wait?: (milliseconds: number) => Promise<void>
}

function assertHostedPage(page: Page, issuer: string) {
    const current = new URL(page.url())
    const provider = new URL(issuer)
    if (
        current.origin !== provider.origin ||
        ![
            `${provider.pathname}/protocol/openid-connect/auth`,
            `${provider.pathname}/login-actions/authenticate`,
            `${provider.pathname}/login-actions/required-action`,
        ].includes(current.pathname)
    )
        throw browserFixtureError()
}

async function assertForm(page: Page, selector: string, issuer: string) {
    assertHostedPage(page, issuer)
    const action = await page.locator(selector).getAttribute('action')
    if (!action) throw browserFixtureError()
    const target = new URL(action, page.url())
    const provider = new URL(issuer)
    if (target.origin !== provider.origin || !target.pathname.startsWith(`${provider.pathname}/login-actions/`)) {
        throw browserFixtureError()
    }
}

async function assertAccount(page: Page, origin: string, seed: BrowserSeedMetadata, identity: BrowserFixtureIdentity) {
    await page.getByRole('heading', { name: 'Your workspace', exact: true }).waitFor()
    const url = new URL(page.url())
    if (url.origin !== origin || url.pathname !== '/app' || url.search || url.hash) throw browserFixtureError()
    // Read only browser-safe current-account data using the browser's real BFF session.
    const matches = await page.evaluate(async expected => {
        const response = await fetch('/v1/auth/session')
        if (!response.ok) return false
        const account = (await response.json()) as { email?: string; membership?: { role?: string } }
        return account.email === expected.email && account.membership?.role === expected.role
    }, seed.users[identity])
    if (!matches) throw browserFixtureError()
}

// Never propagate a Playwright error: its message can include URLs, input values, or page HTML.
export async function hostedMfaLogin(options: LoginOptions): Promise<string> {
    const { page, identity, origin, seed } = options
    const now = options.now ?? Date.now
    const wait = options.wait ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
    let step = 'start'
    try {
        step = 'goto'
        await page.goto(`${origin}/`)
        step = 'signIn href'
        const signIn = page.getByRole('link', { name: 'Sign in', exact: true })
        const href = await signIn.getAttribute('href')
        if (!href || new URL(href, origin).origin !== origin || new URL(href, origin).pathname !== '/v1/auth/login') {
            throw browserFixtureError()
        }
        step = 'signIn click'
        await signIn.click()
        step = 'username waitFor'
        await page.locator('#username').waitFor()
        step = 'assertForm kc-form-login'
        await assertForm(page, '#kc-form-login', seed.issuer)
        step = 'fill username'
        await page.getByRole('textbox', { name: /username|email/i }).fill(seed.users[identity].email)
        step = 'fill password'
        await page
            .getByLabel('Password', { exact: true })
            .fill(identity === 'owner' ? CUSTOMER_OWNER_PASSWORD : PLATFORM_OPERATOR_PASSWORD)
        step = 'click sign in'
        await page.getByRole('button', { name: 'Sign In', exact: true }).click()
        step = 'assertHostedPage after password'
        assertHostedPage(page, seed.issuer) // Password alone must never complete privileged login.

        step = 'detect enrollment'
        const enrollment = (await page.locator('#kc-totp-settings-form').count()) === 1
        let secret = options.secret
        if (enrollment) {
            if (secret) throw browserFixtureError()
            step = 'assertForm kc-totp-settings-form (before unable-to-scan)'
            await assertForm(page, '#kc-totp-settings-form', seed.issuer)
            step = 'click unable to scan'
            await page.getByRole('link', { name: /unable to scan/i }).click()
            step = 'assertForm kc-totp-settings-form (after unable-to-scan)'
            await assertForm(page, '#kc-totp-settings-form', seed.issuer)
            // Keycloak groups the displayed uppercase key with spaces for human transcription.
            step = 'read displayed secret'
            const displayed = await page.locator('#kc-totp-secret-key').innerText()
            if (!/^[A-Z2-7 ]+$/.test(displayed)) throw browserFixtureError()
            secret = displayed.replace(/ /g, '')
            assertTotpSecret(secret)
            step = 'fill userLabel'
            await page.locator('#userLabel').fill('Development browser fixture')
        } else {
            if (!secret) throw browserFixtureError()
            step = 'assertForm kc-otp-login-form'
            await assertForm(page, '#kc-otp-login-form', seed.issuer)
        }
        assertTotpSecret(secret)
        for (let attempt = 0; attempt < 2; attempt++) {
            const time = now()
            step = `fill totp/otp attempt ${attempt}`
            await page.locator(enrollment ? '#totp' : '#otp').fill(generateTotp(secret, time))
            step = `click submit attempt ${attempt}`
            await page.getByRole('button', { name: enrollment ? 'Submit' : 'Sign In', exact: true }).click()
            if (new URL(page.url()).origin === origin) {
                step = 'assertAccount'
                await assertAccount(page, origin, seed, identity)
                return secret
            }
            step = `assertForm after rejection, attempt ${attempt}`
            await assertForm(page, enrollment ? '#kc-totp-settings-form' : '#kc-otp-login-form', seed.issuer)
            const rejection = enrollment ? '#input-error-totp, #input-error-otp-code' : '#input-error-otp'
            if (attempt === 1 || !(await page.locator(rejection).isVisible())) throw browserFixtureError()
            // A just-used code or a clock boundary permits one next-window retry, never a loop.
            await wait(30_000 - (time % 30_000) + 100)
        }
        throw browserFixtureError()
    } catch (debugError) {
        console.error(
            `DEBUG hostedMfaLogin[${identity}] failed at step "${step}". url=${page.url()}. error=`,
            debugError,
        )
        throw browserFixtureError()
    }
}

export async function signOutFixture(page: Page): Promise<void> {
    try {
        await page.getByRole('button', { name: 'Sign out', exact: true }).click()
        await page.getByRole('heading', { name: 'You are signed out', exact: true }).waitFor()
    } catch {
        throw browserFixtureError()
    }
}
