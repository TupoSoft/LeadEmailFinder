import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test'
import { Redis } from 'ioredis'

interface MemberFixture {
    username: string
    password: string
    organizationId: string
}

interface LiveFixture extends MemberFixture {
    replacement: MemberFixture
    redisUrl: string
}

const origin = process.env.WEB_LIVE_ORIGIN ?? 'http://localhost:53000'

function fixture(): LiveFixture {
    if (!process.env.WEB_LIVE_FIXTURE) throw new Error('Run the checkout-owned test:web-live fixture launcher')
    return JSON.parse(readFileSync(process.env.WEB_LIVE_FIXTURE, 'utf8')) as LiveFixture
}

async function login(page: Page, member: MemberFixture) {
    await page.locator('#username').fill(member.username)
    await page.locator('#password').fill(member.password)
    await page.locator('#kc-login').click()
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
}

async function clearProviderSession(context: BrowserContext) {
    // Keep the application cookie: replacement must revoke its exact old server session.
    await context.clearCookies({ name: /^(?:KEYCLOAK_|AUTH_SESSION_ID|KC_)/ })
}

async function expectAccessible(page: Page) {
    const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
        .analyze()
    expect(result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
}

async function expireCurrentSession(context: BrowserContext, redisUrl: string) {
    const session = (await context.cookies(origin)).find(cookie => cookie.name === 'lef_session')
    if (!session?.value) throw new Error('Live shell fixture has no browser session to expire')
    const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false })
    try {
        await redis.connect()
        expect(await redis.pexpire(`bff-session:${session.value}`, 1)).toBe(1)
        await expect.poll(async () => redis.exists(`bff-session:${session.value}`)).toBe(0)
    } finally {
        await redis.quit()
    }
}

async function expectHistoryRestoresSafely(original: BrowserContext, email: string) {
    // Keep this launch isolated: Playwright's regular browser disables the back/forward cache.
    const browser = await chromium.launch({ channel: 'chromium', ignoreDefaultArgs: ['--disable-back-forward-cache'] })
    try {
        const context = await browser.newContext({ baseURL: origin })
        await context.addCookies(
            (await original.cookies(origin)).filter(
                cookie => cookie.name === 'lef_session' || cookie.name === 'lef_csrf_token',
            ),
        )
        const page = await context.newPage()
        await page.goto('/app')
        await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
        await page.evaluate(accountEmail => {
            window.addEventListener('pageshow', event => {
                if (!event.persisted) return
                document.documentElement.dataset.bfcacheRestored = 'true'
                document.documentElement.dataset.bfcacheAccountCleared = String(
                    !document.body.textContent?.includes(accountEmail),
                )
            })
        }, email)
        await page.goto('/licenses/inter-OFL.txt')
        // A restored document emits pageshow, without a new load event.
        await page.goBack({ waitUntil: 'commit' })
        await expect(page.locator('html')).toHaveAttribute('data-bfcache-restored', 'true')
        await expect(page.locator('html')).toHaveAttribute('data-bfcache-account-cleared', 'true')
        await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    } finally {
        await browser.close()
    }
}

test('real shell login preserves its destination, recovers expiry, rejects a forbidden API read, and signs out across tabs', async ({
    page,
    context,
}) => {
    const member = fixture()
    const errors: string[] = []
    page.on('pageerror', () => errors.push('pageerror'))
    await page.goto('/app?view=history')
    await login(page, member)
    await expect(page).toHaveURL(`${origin}/app?view=history`)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    await expectAccessible(page)

    await expectHistoryRestoresSafely(context, member.username)

    // The future feature route is outside this slice; authorization remains observable at its real API boundary.
    const forbidden = await page.evaluate(async organizationId => {
        const response = await fetch(`/v1/organizations/${organizationId}/service-clients`)
        return response.status
    }, member.organizationId)
    expect(forbidden).toBe(403)
    await page.goto('/app/forbidden')
    await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
    await expectAccessible(page)
    await page.goto('/app?view=history')
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()

    await expireCurrentSession(context, member.redisUrl)
    await page.getByRole('button', { name: 'Refresh account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your session has expired', exact: true })).toBeVisible()
    await expect(page.getByText(member.username, { exact: true })).toBeHidden()
    await expectAccessible(page)
    await clearProviderSession(context)
    await page.getByRole('link', { name: /sign in/i }).click()
    await login(page, member)
    await expect(page).toHaveURL(`${origin}/app?view=history`)

    const second = await context.newPage()
    await second.goto('/app')
    await expect(second.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    await page.setViewportSize({ width: 320, height: 720 })
    const open = page.getByRole('button', { name: 'Open navigation', exact: true })
    await open.focus()
    await page.keyboard.press('Enter')
    const navigation = page.getByRole('navigation', { name: 'Application navigation' })
    await expect(navigation.getByRole('link').first()).toBeFocused()
    await expectAccessible(page)
    await page.keyboard.press('Escape')
    await expect(open).toBeFocused()
    await page.keyboard.press('Enter')
    const logoutResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/auth/logout')
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    expect((await logoutResponse).status()).toBe(204)
    await expect(page.getByRole('heading', { name: 'You are signed out', exact: true })).toBeVisible()
    await expect(second.getByRole('heading', { name: 'Your workspace', exact: true })).toBeHidden()
    await expect(second.getByText(member.username, { exact: true })).toBeHidden()
    await expectAccessible(page)
    expect(
        (await context.cookies(origin)).some(
            cookie => cookie.name === 'lef_session' || cookie.name === 'lef_csrf_token',
        ),
    ).toBe(false)
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
    expect(errors).toEqual([])
    await second.close()
})

test('a real replacement membership in the same organization invalidates the captured cookie and refreshes another tab', async ({
    page,
    context,
    browser,
}) => {
    const member = fixture()
    await page.goto('/app')
    await login(page, member)
    const oldCookie = (await context.cookies(origin)).find(cookie => cookie.name === 'lef_session')
    if (!oldCookie) throw new Error('Live replacement fixture has no old session cookie')
    const captured = await browser.newContext({ baseURL: origin })
    await captured.addCookies([oldCookie])
    const second = await context.newPage()
    try {
        await second.goto('/app')
        await expect(second.getByText(member.username, { exact: true }).first()).toBeVisible()
        await clearProviderSession(context)
        await page.goto('/v1/auth/login?destination=%2Fapp')
        await login(page, member.replacement)
        await expect(page.getByText(member.replacement.username, { exact: true }).first()).toBeVisible()
        await expect(page.getByText(member.username, { exact: true })).toBeHidden()
        await expect(second.getByText(member.username, { exact: true })).toBeHidden()
        await expect(second.getByText(member.replacement.username, { exact: true }).first()).toBeVisible()
        expect((await captured.request.get('/v1/auth/session')).status()).toBe(401)
        expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
        await expectAccessible(second)
        await page.getByRole('button', { name: 'Sign out', exact: true }).click()
        await expect(page.getByRole('heading', { name: 'You are signed out', exact: true })).toBeVisible()
    } finally {
        await second.close()
        await captured.close()
    }
})

test('two distinct real provider callbacks race to replace one old session with exactly one winner', async ({
    page,
    context,
    browser,
}) => {
    const member = fixture()
    await page.goto('/app')
    await login(page, member)
    const oldCookie = (await context.cookies(origin)).find(cookie => cookie.name === 'lef_session')
    if (!oldCookie) throw new Error('Live racing fixture has no old session cookie')
    const competitors = await Promise.all([
        browser.newContext({ baseURL: origin }),
        browser.newContext({ baseURL: origin }),
    ])
    const redis = new Redis(member.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false })
    try {
        await redis.connect()
        const previousKeys = new Set(await redis.keys('bff-session:*'))
        const callbackUrls: string[] = []
        // Acquire each unused provider code before racing the BFF callbacks below.
        for (const competitor of competitors) {
            await competitor.addCookies([oldCookie])
            const tab = await competitor.newPage()
            let captured!: (url: string) => void
            const callback = new Promise<string>(resolve => {
                captured = resolve
            })
            await tab.goto('/v1/auth/login?destination=%2Fapp')
            const formAction = await tab.locator('#kc-form-login').getAttribute('action')
            if (!formAction) throw new Error('Live race fixture has no provider form action')
            // Intercept the form POST itself: routing does not intercept later redirect-chain requests.
            await tab.route(formAction, async route => {
                const response = await route.fetch({ maxRedirects: 0 })
                const destination = response.headers().location
                if (
                    response.status() !== 302 ||
                    !destination ||
                    new URL(destination).origin !== origin ||
                    new URL(destination).pathname !== '/v1/auth/callback'
                ) {
                    throw new Error('Live race fixture did not receive its expected provider callback')
                }
                captured(destination)
                await route.fulfill({
                    status: 200,
                    contentType: 'text/html',
                    body: '<!doctype html><title>Login ready</title><p>Login ready</p>',
                })
            })
            await tab.locator('#username').fill(member.username)
            await tab.locator('#password').fill(member.password)
            await tab.locator('#kc-login').click()
            callbackUrls.push(await callback)
        }
        expect(callbackUrls[0] === callbackUrls[1]).toBe(false)
        expect(
            new URL(callbackUrls[0]).searchParams.get('state') === new URL(callbackUrls[1]).searchParams.get('state'),
        ).toBe(false)
        const responses = await Promise.all(
            competitors.map((competitor, index) => competitor.request.get(callbackUrls[index], { maxRedirects: 0 })),
        )
        const destinations = responses.map(response => response.headers().location)
        expect(responses.map(response => response.status())).toEqual([302, 302])
        expect(destinations.filter(destination => destination === `${origin}/app`)).toHaveLength(1)
        expect(
            destinations.filter(destination => destination === `${origin}/auth/error?code=login_state_invalid`),
        ).toHaveLength(1)
        const created = (await redis.keys('bff-session:*')).filter(key => !previousKeys.has(key))
        expect(created).toHaveLength(1)
        expect(await redis.exists(`bff-session:${oldCookie.value}`)).toBe(0)
        expect((await context.request.get('/v1/auth/session')).status()).toBe(401)
        const winner = competitors[destinations.indexOf(`${origin}/app`)]
        const winnerPage = await winner.newPage()
        await winnerPage.goto('/app')
        await expect(winnerPage.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
        await winnerPage.getByRole('button', { name: 'Sign out', exact: true }).click()
        await expect(winnerPage.getByRole('heading', { name: 'You are signed out', exact: true })).toBeVisible()
        expect(await redis.exists(created[0])).toBe(0)
    } finally {
        await Promise.all(competitors.map(competitor => competitor.close()))
        await redis.quit()
    }
})
