import AxeBuilder from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { CurrentAccount } from '../../src/api/current-account'

const account: CurrentAccount = {
    organization: { id: 'f8608f22-f55d-4acd-81df-b499c36c5571', name: 'Northstar research' },
    membership: { id: '6b67aa72-4d93-4614-9de3-ed69ac272452', role: 'member' },
    email: 'first.member@example.test',
    capabilities: ['verification.run', 'verification.read'],
    grantableServiceClientPermissions: [],
}

async function mockSession(context: BrowserContext, body: unknown = account, status = 200) {
    await context.route('**/v1/auth/session', route => route.fulfill({ status, json: body }))
}

async function expectAccessible(page: Page) {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
        .analyze()
    expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
}

async function signOut(page: Page) {
    const open = page.getByRole('button', { name: 'Open navigation', exact: true })
    if (await open.isVisible()) await open.click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
}

test('protected home bootstraps, refreshes, and remains accessible without storing tokens', async ({
    page,
    context,
}) => {
    await mockSession(context)
    const errors: string[] = []
    page.on('pageerror', () => errors.push('pageerror'))
    page.on('console', message => {
        if (message.type() === 'error') errors.push('console error')
    })
    await page.goto('/app')
    await expect(page.getByRole('heading', { level: 1, name: 'Your workspace', exact: true })).toBeVisible()
    await expect(page).toHaveTitle('Your workspace | Lead Email Finder')
    await expect(page.getByRole('main').getByText(account.organization.name, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Your workspace', exact: true })).toBeVisible()
    await expectAccessible(page)
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
    expect(errors).toEqual([])
})

test('bootstrap loading remains accessible while the session read is pending', async ({ page, context }) => {
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    await context.route('**/v1/auth/session', async route => {
        await pending
        await route.fulfill({ status: 200, json: account })
    })
    try {
        await page.goto('/app')
        await expect(page.getByRole('heading', { name: 'Opening your workspace' })).toBeVisible()
        await expectAccessible(page)
    } finally {
        release()
    }
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
})

test('bootstrap preserves the frame through loading, accessible failure, and retry', async ({ page, context }) => {
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    await context.route('**/v1/auth/session', async route => {
        await pending
        await route.fulfill({ status: 503, json: {} })
    })
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Opening your workspace' })).toBeVisible()
    const headerBefore = await page.getByRole('banner').boundingBox()
    release()
    await expect(page.getByRole('heading', { name: 'Your workspace could not be opened' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    expect(await page.getByRole('banner').boundingBox()).toEqual(headerBefore)
    await expectAccessible(page)
    await mockSession(context)
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    expect(await page.getByRole('banner').boundingBox()).toEqual(headerBefore)
})

test('a post-bootstrap 401 clears the account and preserves the requested destination for recovery', async ({
    page,
    context,
}) => {
    let expired = false
    await context.route('**/v1/auth/session', route =>
        route.fulfill({
            status: expired ? 401 : 200,
            json: expired ? { code: 'authentication_required' } : account,
        }),
    )
    await page.goto('/app?view=history')
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    expired = true
    await page.getByRole('button', { name: 'Refresh account', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Your session has expired' })).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/app/session-expired')
    expect(new URL(page.url()).searchParams.get('destination')).toBe('/app?view=history')
    const href = await page.getByRole('link', { name: 'Sign in', exact: true }).getAttribute('href')
    expect(new URL(href!, page.url()).searchParams.get('destination')).toBe('/app?view=history')
    await expect(page.getByText(account.email!, { exact: true })).toBeHidden()
    await expectAccessible(page)
})

test('keyboard navigation has a skip link, visible focus, and a narrow menu with focus return', async ({
    page,
    context,
}) => {
    await mockSession(context)
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()

    await page.setViewportSize({ width: 320, height: 720 })
    const trigger = page.getByRole('button', { name: 'Open navigation', exact: true })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const navigation = page.getByRole('navigation', { name: 'Application navigation' })
    await expect(navigation).toBeVisible()
    await expect(navigation.getByRole('link').first()).toBeFocused()
    const outline = await navigation
        .getByRole('link')
        .first()
        .evaluate(element => {
            const style = getComputedStyle(element)
            return { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle }
        })
    expect(outline.width).toBeGreaterThan(0)
    expect(outline.style).not.toBe('none')
    await expectAccessible(page)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await expect(navigation).toBeHidden()
    await page.keyboard.press('Enter')
    await navigation.getByRole('link').first().click()
    await expect(navigation).toBeHidden()
    await expect(trigger).toBeFocused()
})

for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
]) {
    test(`nullable email and long organization names reflow with reduced motion at ${viewport.width} pixels`, async ({
        page,
        context,
    }) => {
        await mockSession(context, {
            ...account,
            email: null,
            organization: { ...account.organization, name: 'International research and infrastructure operations' },
        })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.setViewportSize(viewport)
        await page.goto('/app')
        await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
        const open = page.getByRole('button', { name: 'Open navigation' })
        if (await open.isVisible()) await open.click()
        await expect(page.getByRole('main').getByText('Email unavailable', { exact: true })).toBeVisible()
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        ).toBe(0)
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto')
        await expectAccessible(page)
    })
}

test('an unauthenticated protected URL starts login with its safe relative destination', async ({ page, context }) => {
    await mockSession(context, { code: 'authentication_required' }, 401)
    await context.route('**/v1/auth/login?*', route =>
        route.fulfill({ contentType: 'text/html', body: '<h1>Provider redirect</h1>' }),
    )
    await page.goto('/app?view=history')
    await expect(page).toHaveURL(/\/v1\/auth\/login\?/)
    expect(new URL(page.url()).searchParams.get('destination')).toBe('/app?view=history')
})

test('current-account rejection removes account details and renders account unavailable', async ({ page, context }) => {
    await mockSession(context, { code: 'human_session_required' }, 403)
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Account unavailable' })).toBeVisible()
    await expect(page).toHaveTitle('Account unavailable | Lead Email Finder')
    await expect(page.getByText(account.email!, { exact: true })).toBeHidden()
    await expectAccessible(page)
})

for (const code of [
    'login_state_invalid',
    'authorization_code_exchange_failed',
    'active_membership_required',
    'raw-provider-secret',
]) {
    test(`callback failure ${code} uses stable safe copy and a fresh login without replaying provider parameters`, async ({
        page,
        context,
    }) => {
        await mockSession(context)
        await page.goto(`/auth/error?code=${code}&state=private-state&error_description=private-provider-message`)
        await expect(page.getByRole('heading', { name: 'Sign-in did not complete' })).toBeVisible()
        await expect(page).toHaveTitle('Sign-in did not complete | Lead Email Finder')
        await expect(page.locator('body')).not.toContainText('private-provider-message')
        await expect(page.locator('body')).not.toContainText('raw-provider-secret')
        const login = page.getByRole('link', { name: /sign in/i })
        await expect(login).toHaveAttribute('href', /^\/v1\/auth\/login(?:\?destination=%2Fapp)?$/)
        await expectAccessible(page)
    })
}

for (const [route, heading, title] of [
    ['/app/session-expired', 'Your session has expired', 'Your session has expired | Lead Email Finder'],
    ['/app/forbidden', 'Access denied', 'Access denied | Lead Email Finder'],
]) {
    test(`${route} has its distinct accessible recovery state`, async ({ page, context }) => {
        await mockSession(context)
        await page.goto(route)
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
        await expect(page).toHaveTitle(title)
        await expectAccessible(page)
    })
}

test('sign-out clears displayed account data immediately, sends CSRF once, and waits for confirmation', async ({
    page,
    context,
}) => {
    await mockSession(context)
    await context.addCookies([{ name: 'lef_csrf_token', value: 'browser-test-csrf', url: 'http://127.0.0.1:4173' }])
    let requests = 0
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    await context.route('**/v1/auth/logout', async route => {
        requests += 1
        expect(route.request().headers()['x-csrf-token']).toBe('browser-test-csrf')
        await pending
        await route.fulfill({ status: 204 })
    })
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    await signOut(page)
    await expect(page.getByText(account.email!, { exact: true })).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeHidden()
    await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeHidden()
    await expectAccessible(page)
    release()
    await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible()
    expect(requests).toBe(1)
    await expectAccessible(page)
})

test('an ambiguous logout never restores account data or retries without a user action', async ({ page, context }) => {
    await mockSession(context)
    let requests = 0
    await context.route('**/v1/auth/logout', route => {
        requests += 1
        return route.fulfill({ status: requests === 1 ? 503 : 204, ...(requests === 1 ? { json: {} } : {}) })
    })
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    await signOut(page)
    await expect(page.getByRole('heading', { name: 'Sign-out could not be confirmed' })).toBeVisible()
    await expect(page.getByText(account.email!, { exact: true })).toBeHidden()
    expect(requests).toBe(1)
    await expectAccessible(page)
    await page.getByRole('button', { name: /retry sign.?out/i }).click()
    await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible()
    expect(requests).toBe(2)
})

test('a second tab hides its account before the sign-out response and before rebootstrap completes', async ({
    page,
    context,
}) => {
    let holdSession = false
    let releaseSession!: () => void
    const sessionPending = new Promise<void>(resolve => {
        releaseSession = resolve
    })
    await context.route('**/v1/auth/session', async route => {
        if (holdSession) await sessionPending
        await route.fulfill({
            status: holdSession ? 401 : 200,
            json: holdSession ? { code: 'authentication_required' } : account,
        })
    })
    let releaseLogout!: () => void
    const logoutPending = new Promise<void>(resolve => {
        releaseLogout = resolve
    })
    await context.route('**/v1/auth/logout', async route => {
        await logoutPending
        await route.fulfill({ status: 204 })
    })
    const second = await context.newPage()
    await Promise.all([page.goto('/app'), second.goto('/app')])
    await expect(second.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    holdSession = true
    await signOut(page)
    await expect(second.getByRole('heading', { name: 'Your workspace', exact: true })).toBeHidden()
    await expect(second.getByText(account.email!, { exact: true })).toBeHidden()
    releaseLogout()
    releaseSession()
    await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible()
    await second.close()
})

test('a restored page hides its previous account synchronously until a fresh bootstrap completes', async ({
    page,
    context,
}) => {
    let restored = false
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    await context.route('**/v1/auth/session', async route => {
        if (restored) await pending
        await route.fulfill({ status: 200, json: account })
    })
    await page.goto('/app')
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    restored = true
    const snapshot = await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
        return document.body.textContent
    })
    expect(snapshot).not.toContain(account.email)
    expect(snapshot).not.toContain('Your workspace')
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeHidden()
    release()
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
})
