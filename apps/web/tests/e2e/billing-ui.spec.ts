import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { CurrentAccount } from '../../src/api/current-account'

const purchaseId = '274ca54d-6fca-4055-9df9-3e05a39d608f'
const account: CurrentAccount = {
    organization: { id: 'f8608f22-f55d-4acd-81df-b499c36c5571', name: 'Northstar research' },
    membership: { id: '6b67aa72-4d93-4614-9de3-ed69ac272452', role: 'owner' },
    email: 'billing.owner@example.test',
    capabilities: ['billing.read', 'billing.manage'],
    grantableServiceClientPermissions: [],
}
const packs = [
    { id: 'starter', credits: 100, amountMinor: 500, currency: 'USD' },
    { id: 'growth', credits: 500, amountMinor: 2400, currency: 'JPY' },
]
const purchase = {
    id: purchaseId,
    packId: 'starter',
    credits: 100,
    amountMinor: 500,
    currency: 'USD',
    status: 'pending',
    createdAt: '2026-09-07T12:00:00.000Z',
    updatedAt: '2026-09-07T12:00:00.000Z',
}

async function mockBilling(
    context: BrowserContext,
    options: { status?: string; balance?: number; readOnly?: boolean; empty?: boolean } = {},
) {
    await context.route('**/v1/auth/session', route =>
        route.fulfill({
            json: { ...account, capabilities: options.readOnly ? ['billing.read'] : account.capabilities },
        }),
    )
    await context.route('**/v1/billing/summary', route => route.fulfill({ json: { balance: options.balance ?? 125 } }))
    await context.route('**/v1/billing/credit-packs', route => route.fulfill({ json: packs }))
    await context.route('**/v1/credit-purchases', route =>
        route.fulfill({ json: options.empty ? [] : [{ ...purchase, status: options.status ?? 'pending' }] }),
    )
}

async function accessible(page: Page) {
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
        .analyze()
    expect(results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
        0,
    )
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
    const caption = page.locator('caption')
    if (await caption.count()) {
        const bounds = await caption.boundingBox()
        expect(bounds?.width).toBeGreaterThan(150)
        expect(bounds?.height).toBeLessThan(80)
    }
}

async function screenshot(page: Page, name: string) {
    if (!process.env.BILLING_SCREENSHOT_DIR) return
    await mkdir(process.env.BILLING_SCREENSHOT_DIR, { recursive: true })
    await page.screenshot({
        path: join(process.env.BILLING_SCREENSHOT_DIR, `${name}-${page.viewportSize()?.width}.png`),
        fullPage: true,
    })
}

for (const [status, heading] of [
    ['pending', 'Payment is pending'],
    ['paid', 'Payment confirmed'],
    ['failed', 'Payment failed'],
    ['expired', 'Checkout expired'],
]) {
    test(`${status} return preserves authoritative amounts with accessible status and focus`, async ({
        page,
        context,
    }) => {
        await mockBilling(context, { status })
        const errors: string[] = []
        page.on('pageerror', () => errors.push('pageerror'))
        page.on('console', message => {
            if (message.type() === 'error') errors.push('console error')
        })
        await page.goto(`/billing/complete?purchaseId=${purchaseId}&status=paid&credits=999999&amountMinor=1`)
        const title = page.getByRole('heading', { name: heading, exact: true })
        await expect(title).toBeVisible()
        await expect(page.getByRole('region', { name: 'Credit balance', exact: true })).toContainText('125 credits')
        await expect(page.getByRole('region', { name: 'Purchase history', exact: true })).toContainText(
            status[0].toUpperCase() + status.slice(1),
        )
        await expect(page.locator('body')).not.toContainText('999999')
        await expect(page.locator('body')).not.toContainText('providerReference')
        await expect(page).toHaveTitle('Billing | Lead Email Finder')
        await accessible(page)
        await screenshot(page, `billing-${status}`)
        expect(errors).toEqual([])
    })
}

test('read-only billing exposes prices, history, and empty recovery without purchase controls', async ({
    page,
    context,
}) => {
    await mockBilling(context, { readOnly: true, empty: true })
    await page.goto('/app/billing')
    await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible()
    await expect(page.getByText('You can view billing.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Buy / })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Credit packs', exact: true })).toContainText(/JPY\s*2,400/)
    await expect(page.getByText('No purchases yet.', { exact: false })).toBeVisible()
    await accessible(page)
})

test('unknown return and partial summary failure leave authoritative history readable with read recovery', async ({
    page,
    context,
}) => {
    await mockBilling(context, { status: 'failed' })
    let unavailable = true
    await context.route('**/v1/billing/summary', route =>
        route.fulfill({ status: unavailable ? 503 : 200, json: unavailable ? {} : { balance: 125 } }),
    )
    await page.goto('/billing/complete?purchaseId=00000000-0000-4000-8000-000000000001&status=paid')
    await expect(page.getByRole('heading', { name: 'You returned from checkout', exact: true })).toBeVisible()
    const summary = page.getByRole('region', { name: 'Credit balance', exact: true })
    await expect(summary.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Purchase history', exact: true })).toContainText('Failed')
    await accessible(page)
    await screenshot(page, 'billing-partial-error')
    unavailable = false
    await summary.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(summary).toContainText('125 credits')
    await accessible(page)
})

test('keyboard checkout prevents duplicate posts and preserves uncertainty after a lost response', async ({
    page,
    context,
}) => {
    await mockBilling(context)
    let posts = 0
    let reads = 0
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    await context.route('**/v1/credit-purchases', async route => {
        if (route.request().method() === 'GET') {
            reads++
            await route.fulfill({ json: [purchase] })
            return
        }
        posts++
        expect(route.request().postDataJSON()).toEqual({ packId: 'starter' })
        await pending
        await route.abort('connectionfailed')
    })
    await page.goto('/app/billing')
    const buy = page.getByRole('button', { name: /^Buy 100 credits for/ })
    await buy.focus()
    await page.keyboard.press('Enter')
    await expect(buy).toBeDisabled()
    await page.getByRole('button', { name: /^Buy 500 credits for/ }).click()
    expect(posts).toBe(1)
    const before = reads
    release()
    await expect(page.getByText('Checkout creation could not be confirmed.', { exact: false })).toBeVisible()
    await expect.poll(() => reads).toBeGreaterThan(before)
    await expect(buy).toBeEnabled()
    expect(posts).toBe(1)
    await expect(page.getByRole('region', { name: 'Credit balance', exact: true })).toContainText('125 credits')
    await expect(page).toHaveURL(/\/app\/billing$/)
    await accessible(page)
})

test('offline narrow history retains full labels and disables purchase actions until reconnection', async ({
    page,
    context,
}) => {
    await mockBilling(context, { status: 'expired' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/app/billing')
    await expect(page.getByRole('region', { name: 'Purchase history', exact: true })).toContainText('Expired')
    await context.setOffline(true)
    await expect(page.getByText('You are offline.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Buy 100 credits for/ })).toBeDisabled()
    await accessible(page)
    await screenshot(page, 'billing-offline')
    await context.setOffline(false)
    await expect(page.getByRole('button', { name: /^Buy 100 credits for/ })).toBeEnabled()
})
