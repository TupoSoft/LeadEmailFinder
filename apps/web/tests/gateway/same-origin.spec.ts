import { expect, test } from '@playwright/test'

const origin = process.env.WEB_LIVE_ORIGIN ?? 'http://localhost:53000'
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
