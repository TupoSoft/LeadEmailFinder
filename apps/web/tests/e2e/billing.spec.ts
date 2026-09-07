import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { repositoryRoot } from '../support/browser-fixture-environment'
import { test, expect } from '../support/privileged-login'
import { signOutFixture } from '../support/hosted-mfa-login'

interface Pack {
    id: string
    credits: number
    amountMinor: number
    currency: string
}
interface Purchase extends Omit<Pack, 'id'> {
    id: string
    packId: string
    status: string
}

function stubFixture(): { origin: string; secret: string } {
    // Output stays in this Node process, never browser state, console output, or an artifact.
    const output = execFileSync(process.execPath, ['scripts/testing/billing-fixture-stack.mjs'], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
    })
    return JSON.parse(output) as { origin: string; secret: string }
}

async function summary(page: Page) {
    const response = await page.request.get(new URL('/v1/billing/summary', page.url()).toString())
    expect(response.status()).toBe(200)
    return (await response.json()) as { balance: number }
}

async function history(page: Page) {
    const response = await page.request.get(new URL('/v1/credit-purchases', page.url()).toString())
    expect(response.status()).toBe(200)
    return (await response.json()) as Purchase[]
}

async function signedEvent(
    page: Page,
    fixture: ReturnType<typeof stubFixture>,
    purchase: Purchase,
    kind: 'paid' | 'failed',
) {
    const payload = JSON.stringify({
        kind: `purchase_${kind}`,
        providerEventId: `browser-${kind}-${purchase.id}`,
        providerReference: `stub_${purchase.id}`,
        purchaseId: purchase.id,
        ...(kind === 'paid' ? { providerTotalMinor: purchase.amountMinor, currency: purchase.currency } : {}),
    })
    const response = await page.request.post(`${fixture.origin}/v1/payments/webhook`, {
        data: payload,
        headers: {
            'content-type': 'application/json',
            'paddle-signature': createHmac('sha256', fixture.secret).update(payload).digest('hex'),
        },
    })
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({ received: true })
}

async function checkout(page: Page, origin: string, pack: Pack) {
    await page.goto(`${origin}/app/billing`)
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible()
    const response = page.waitForResponse(
        value => new URL(value.url()).pathname === '/v1/credit-purchases' && value.request().method() === 'POST',
    )
    const buy = page.getByRole('button', {
        name: new RegExp(`^Buy ${pack.credits.toLocaleString('en-US')} credits for`),
    })
    await buy.focus()
    await page.keyboard.press('Enter')
    const created = await response
    expect(created.status()).toBe(201)
    expect(created.request().postDataJSON()).toEqual({ packId: pack.id })
    // Chromium may discard the POST body after the immediate top-level navigation. Inspect
    // the real destination and authoritative history rather than intercepting the response.
    await expect(page).toHaveURL(/\/billing\/complete\?purchaseId=/)
    const returned = new URL(page.url())
    expect(returned.origin).toBe(origin)
    expect(returned.pathname).toBe('/billing/complete')
    expect([...returned.searchParams.keys()]).toEqual(['purchaseId'])
    await expect(page.getByRole('heading', { name: 'Payment is pending', exact: true })).toBeVisible()
    const purchase = (await history(page)).find(row => row.id === returned.searchParams.get('purchaseId'))
    expect(purchase?.status).toBe('pending')
    expect(purchase).toBeDefined()
    return purchase!
}

test('owner sees pending then paid and failed stub purchases with authoritative credit balances', async ({
    loginAs,
}) => {
    const fixture = stubFixture()
    const page = await loginAs('owner')
    const errors: string[] = []
    let posts = 0
    page.on('pageerror', () => errors.push('pageerror'))
    page.on('console', message => {
        if (message.type() === 'error') errors.push('console error')
    })
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/v1/credit-purchases' && request.method() === 'POST') posts++
    })
    const before = await summary(page)
    const catalog = await page.request.get(`${fixture.origin}/v1/billing/credit-packs`)
    expect(catalog.status()).toBe(200)
    const packs = (await catalog.json()) as Pack[]
    expect(packs.length).toBeGreaterThan(0)
    for (const pack of packs) expect(Object.keys(pack).sort()).toEqual(['amountMinor', 'credits', 'currency', 'id'])
    const pack = packs[0]
    const paid = await checkout(page, fixture.origin, pack)
    expect(posts).toBe(1)
    expect((await summary(page)).balance).toBe(before.balance)
    await expect(page.getByRole('region', { name: 'Credit balance', exact: true })).toContainText(
        `${before.balance.toLocaleString('en-US')} credits`,
    )
    await signedEvent(page, fixture, paid, 'paid')
    await expect(page.getByRole('heading', { name: 'Payment confirmed', exact: true })).toBeVisible({ timeout: 15_000 })
    const granted = before.balance + pack.credits
    await expect(page.getByRole('region', { name: 'Credit balance', exact: true })).toContainText(
        `${granted.toLocaleString('en-US')} credits`,
    )
    expect((await summary(page)).balance).toBe(granted)
    expect((await history(page)).find(row => row.id === paid.id)?.status).toBe('paid')
    // A replay is read-only with respect to the credit grant.
    await signedEvent(page, fixture, paid, 'paid')
    expect((await summary(page)).balance).toBe(granted)

    const failed = await checkout(page, fixture.origin, pack)
    expect(posts).toBe(2)
    expect((await summary(page)).balance).toBe(granted)
    await signedEvent(page, fixture, failed, 'failed')
    await expect(page.getByRole('heading', { name: 'Payment failed', exact: true })).toBeVisible({ timeout: 15_000 })
    expect((await summary(page)).balance).toBe(granted)
    expect((await history(page)).find(row => row.id === failed.id)?.status).toBe('failed')
    await expect(page).toHaveTitle('Billing | Lead Email Finder')
    const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    expect(
        accessibility.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? '')),
    ).toEqual([])
    expect(errors).toEqual([])
    expect(posts).toBe(2)
    await signOutFixture(page)
})
