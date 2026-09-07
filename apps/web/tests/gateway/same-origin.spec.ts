import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { ApiClient } from '@tuposoft/lead-email-finder-api-client'

declare global {
    interface Window {
        gatewayClient: { createBrowserApiClient(): ApiClient }
    }
}

const origin = process.env.WEB_LIVE_ORIGIN ?? 'http://localhost:53000'
const keycloakOrigin = process.env.WEB_LIVE_KEYCLOAK_ORIGIN ?? 'http://localhost:58080'
const csp =
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"

function expectStaticHeaders(headers: Record<string, string>) {
    expect(headers['content-security-policy']).toBe(csp)
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()')
}

test('built product and not-found navigation retain security headers and working assets', async ({ page, request }) => {
    const errors: string[] = []
    page.on('pageerror', () => errors.push('pageerror'))
    page.on('console', message => {
        if (message.type() === 'error') errors.push('console error')
    })
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    expectStaticHeaders(response!.headers())
    expect(response!.headers()['cache-control']).toBe('no-cache')
    await expect(page).toHaveTitle('Lead Email Finder | Verify the signal before you send.')
    await expect(page.getByRole('heading', { level: 1, name: 'Verify the signal before you send.' })).toBeVisible()
    expect(await page.locator('script:not([src]), [style], style').count()).toBe(0)
    const assets = await page
        .locator('script[src], link[rel="stylesheet"]')
        .evaluateAll(elements =>
            elements.map(element => element.getAttribute('src') ?? element.getAttribute('href') ?? ''),
        )
    expect(assets.length).toBeGreaterThanOrEqual(2)
    for (const asset of assets) {
        expect(asset).toMatch(/^\/assets\//)
        const assetResponse = await request.get(asset)
        expect(assetResponse.status()).toBe(200)
        expectStaticHeaders(assetResponse.headers())
        expect(assetResponse.headers()['cache-control']).toContain('immutable')
    }
    await page.getByRole('link', { name: 'Principles', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/#principles`)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Our principles guide every signal.' })).toBeVisible()
    const unknown = await page.goto('/not-real')
    expect(unknown?.status()).toBe(200)
    expectStaticHeaders(unknown!.headers())
    await expect(page).toHaveTitle('Page not found | Lead Email Finder')
    await expect(page.getByRole('heading', { level: 1, name: 'This signal ends here.' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to home' }).click()
    await expect(page).toHaveURL(`${origin}/`)
    expect(errors).toEqual([])
})

test('all reserved API paths and Swagger assets bypass the SPA', async ({ page, request }) => {
    for (const path of [
        '/v1/not-real',
        '/verify/not-real',
        '/verifyAsync/not-real/child',
        '/verifyBatch/not-real/child',
        '/emails/not-real/child',
        '/credits/not-real/child',
        '/docs-json',
        '/docs-yaml',
    ]) {
        const response = await request.get(path)
        expect(response.status(), path).toBe(404)
        expect(response.headers()['content-type'], path).toContain('application/json')
        expect((await response.json()) as { statusCode: number }).toMatchObject({ statusCode: 404 })
    }
    const health = await request.get('/health')
    expect(health.status()).toBe(200)
    expect(health.headers()['content-type']).toContain('application/json')
    const contract = await request.get('/openapi.json')
    expect(contract.status()).toBe(200)
    expect(contract.headers()['content-type']).toContain('application/json')
    expect((await contract.json()) as { servers: { url: string }[] }).toMatchObject({ servers: [{ url: '/' }] })
    const docs = await page.goto('/docs')
    expect(docs?.status()).toBe(200)
    expect(docs!.headers()['content-type']).toContain('text/html')
    await expect(page.locator('.swagger-ui').first()).toBeVisible()
    const operation = page
        .locator('.opblock')
        .filter({ has: page.locator('[data-path="/health"]') })
        .first()
    await operation.locator('.opblock-summary').click()
    await operation.getByRole('button', { name: 'Try it out' }).click()
    const responsePromise = page.waitForResponse(response => response.url() === `${origin}/health`)
    await operation.getByRole('button', { name: 'Execute', exact: true }).click()
    const executed = await responsePromise
    expect(executed.status()).toBe(200)
    expect(executed.headers()['content-type']).toContain('application/json')
})

test('real Keycloak login reads an opaque cookie session and logs out using the browser CSRF client', async ({
    page,
    context,
}) => {
    const fixturePath = process.env.WEB_LIVE_FIXTURE
    if (!fixturePath) throw new Error('Run the checkout-owned test:web-live wrapper to supply the transient member')
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
        username: string
        password: string
        organizationId: string
        clientBundle: string
    }
    const loginResponse = page.waitForResponse(response => response.url() === `${origin}/v1/auth/login`)
    await page.goto('/v1/auth/login')
    const login = await loginResponse
    expect(login.status()).toBe(302)
    const location = new URL(login.headers().location)
    expect(location.origin).toBe(keycloakOrigin)
    expect(location.searchParams.get('redirect_uri')).toBe(`${origin}/v1/auth/callback`)
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    await page.locator('#username').fill(fixture.username)
    await page.locator('#password').fill(fixture.password)
    const callbackResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/v1/auth/callback')
    await page.locator('#kc-login').click()
    const callback = await callbackResponse
    expect(callback.status()).toBe(302)
    expect(callback.headers().location).toBe(`${origin}/app`)
    expect(callback.headers()['cache-control']).toBe('no-store')
    expect(callback.headers()['referrer-policy']).toBe('no-referrer')
    await expect(page).toHaveURL(`${origin}/app`)
    await expect(page.getByRole('heading', { name: 'Your workspace', exact: true })).toBeVisible()
    const cookies = await context.cookies(origin)
    const session = cookies.find(cookie => cookie.name === 'lef_session')
    expect(Boolean(session?.value)).toBe(true)
    expect(session?.httpOnly).toBe(true)
    expect(session?.sameSite).toBe('Lax')
    expect(Boolean(cookies.find(cookie => cookie.name === 'lef_csrf_token')?.value)).toBe(true)
    expect(await page.evaluate(() => document.cookie.includes('lef_session='))).toBe(false)

    // Execute a temporary bundle of the actual generated transport and CSRF middleware via CDP.
    // The public application does not acquire a test endpoint or ship this fixture bundle.
    await page.evaluate(readFileSync(fixture.clientBundle, 'utf8'))
    const account = await page.evaluate(async () => {
        const result = await window.gatewayClient.createBrowserApiClient().GET('/v1/auth/session')
        return { status: result.response.status, data: result.data }
    })
    expect(account.status).toBe(200)
    expect(account.data).toMatchObject({
        organization: { id: fixture.organizationId },
        membership: { role: 'member' },
        capabilities: ['verification.run', 'verification.read'],
    })
    expect(JSON.stringify(account.data)).not.toMatch(/access_token|refresh_token|id_token/)
    expect(await page.evaluate(async () => (await fetch('/v1/auth/logout', { method: 'POST' })).status)).toBe(403)
    const logout = await page.evaluate(async () => {
        const result = await window.gatewayClient.createBrowserApiClient().POST('/v1/auth/logout')
        return result.response.status
    })
    expect(logout).toBe(204)
    expect(await page.evaluate(async () => (await fetch('/v1/auth/session')).status)).toBe(401)
    expect(
        (await context.cookies(origin)).some(
            cookie => cookie.name === 'lef_session' || cookie.name === 'lef_csrf_token',
        ),
    ).toBe(false)
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
})
