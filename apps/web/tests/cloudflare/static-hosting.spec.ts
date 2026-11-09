import { expect, test } from '@playwright/test'
import { STATIC_SECURITY_HEADERS } from '../../gateway-routes'

function expectSecurityHeaders(headers: Record<string, string>, invitation = false) {
    for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
        const expected = invitation && name === 'Referrer-Policy' ? 'no-referrer' : value
        expect(headers[name.toLowerCase()], name).toBe(expected)
    }
}

test('serves the public site, immutable assets, and SPA hard refreshes without an API', async ({ page, request }) => {
    const errors: string[] = []
    const apiRequests: string[] = []
    page.on('pageerror', () => errors.push('pageerror'))
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text())
    })
    page.on('request', request => {
        if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') apiRequests.push(request.url())
    })

    const home = await page.goto('/')
    expect(home?.status()).toBe(200)
    expectSecurityHeaders(home!.headers())
    expect(home!.headers()['cache-control']).toBe('no-cache')
    await expect(page).toHaveTitle('Lead Email Finder | Verify the signal before you send.')
    await expect(page.getByRole('heading', { level: 1, name: 'Verify the signal before you send.' })).toBeVisible()

    const assets = await page
        .locator('script[src], link[rel="stylesheet"]')
        .evaluateAll(elements =>
            elements.map(element => element.getAttribute('src') ?? element.getAttribute('href') ?? ''),
        )
    expect(assets.length).toBeGreaterThanOrEqual(2)
    for (const asset of assets) {
        const response = await request.get(asset)
        expect(response.status(), asset).toBe(200)
        expectSecurityHeaders(response.headers())
        expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
        expect(response.headers()['content-type']).toMatch(/javascript|css/)
    }

    await page.getByRole('link', { name: 'Principles', exact: true }).click()
    await expect(page).toHaveURL(/#principles$/)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Our principles guide every signal.' })).toBeVisible()

    const missing = await page.goto('/this-page-does-not-exist')
    expect(missing?.status()).toBe(200)
    expectSecurityHeaders(missing!.headers())
    expect(missing!.headers()['cache-control']).toBe('no-cache')
    await expect(page.getByRole('heading', { name: 'This signal ends here.' })).toBeVisible()
    await page.reload()
    await expect(page).toHaveTitle('Page not found | Lead Email Finder')
    await page.getByRole('link', { name: 'Back to home' }).click()
    await expect(page).toHaveURL('/')
    expect(errors).toEqual([])
    expect(apiRequests).toEqual([])
})

test('keeps invitation documents private when serving the SPA fallback', async ({ request }) => {
    for (const path of [
        '/accept-invitation',
        '/accept-invitation/',
        '/accept-invitation/synthetic-token',
        '/accept-invitation?source=synthetic',
        '/accept%2Dinvitation/synthetic-token',
        '/accept-invitation%2Fsynthetic-token',
    ]) {
        const response = await request.get(path, { headers: { 'Sec-Fetch-Mode': 'navigate' } })
        expect(response.status(), path).toBe(200)
        expectSecurityHeaders(response.headers(), true)
        expect(response.headers()['cache-control'], path).toBe('no-store')
        expect(response.headers()['content-type'], path).toContain('text/html')
        expect(await response.text()).toContain('<div id="root">')
    }
})
