import AxeBuilder from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { components } from '@tuposoft/lead-email-finder-api-client'
import type { CurrentAccount } from '../../src/api/current-account'

const id = '725d7b63-6a47-4d14-8709-f2966f5a0948'
const account: CurrentAccount = {
    organization: { id: 'd15c682a-9354-4378-af6c-a456fb661d1f', name: 'Northstar research' },
    membership: { id: 'ee8c7d63-cba5-4e01-800e-8d715b8b83fa', role: 'owner' },
    email: 'owner@example.test',
    capabilities: ['verification.run', 'verification.read', 'billing.read'],
    grantableServiceClientPermissions: [],
}
const result = {
    id: '4a332fe2-2d90-43a0-bd30-a09b718d93ac',
    email: 'synthetic@lef.test',
    localPart: 'synthetic',
    domain: 'lef.test',
    exists: true,
    catchAll: false,
    reason: 'accepted_email',
    sources: ['mx'],
    mxDomain: 'mail.lef.test',
    targetExchange: 'mail.lef.test',
}
const operation: components['schemas']['VerificationOperationMetadataDto'] = {
    id,
    source: 'cache',
    observedAt: '2026-09-15T10:00:00.000Z',
    cacheExpiresAt: '2026-09-16T10:00:00.000Z',
    billing: { state: 'settled', reserved: 0, charged: 0, reason: 'cached' },
}

async function mockAccount(context: BrowserContext, getAccount: () => CurrentAccount = () => account) {
    await context.route('**/v1/auth/session', route => route.fulfill({ json: getAccount() }))
    await context.route('**/v1/billing/summary', route =>
        route.fulfill({ json: { balance: 10, reserved: 3, available: 7 } }),
    )
    await context.route('**/v1/billing/credit-packs', route => route.fulfill({ json: [] }))
    await context.route('**/v1/credit-purchases', route => route.fulfill({ json: [] }))
}

async function accessible(page: Page) {
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(audit.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? ''))).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
        0,
    )
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

for (const viewport of [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
]) {
    test(`authoritative billing and duplicate batch counts remain readable at ${viewport.width}`, async ({
        page,
        context,
    }) => {
        await page.setViewportSize(viewport)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await mockAccount(context)
        const errors: string[] = []
        page.on('pageerror', () => errors.push('pageerror'))
        page.on('console', message => {
            if (message.type() === 'error') errors.push('console error')
        })
        await page.goto('/app/billing')
        await expect(page).toHaveTitle('Billing | Lead Email Finder')
        const balance = page.getByRole('region', { name: 'Credit balance', exact: true })
        await expect(balance).toContainText('Available credits')
        await expect(balance).toContainText('7 credits')
        await expect(balance.getByText('Reserved credits', { exact: true }).locator('..')).toContainText('3')
        await expect(balance.getByText('Total balance', { exact: true }).locator('..')).toContainText('10')
        await accessible(page)
        await page.screenshot({ path: `/tmp/issue577-billing-${viewport.width}.png`, fullPage: true })
        await context.route(`**/verifyBatch/${id}`, route =>
            route.fulfill({
                json: {
                    id,
                    status: 'completed',
                    progress: 100,
                    total: 100,
                    processed: 100,
                    unprocessed: 0,
                    resultsAvailable: true,
                    counts: {
                        totalRows: 100,
                        uniqueAddresses: 80,
                        duplicateRows: 20,
                        cachedAddresses: 20,
                        sharedAddresses: 0,
                        cooldownAddresses: 0,
                        completedAddresses: 80,
                        conclusiveAddresses: 65,
                        inconclusiveAddresses: 15,
                        failedAddresses: 0,
                    },
                    billing: { state: 'settled', reserved: 60, charged: 45 },
                },
            }),
        )
        const csv = `email\n${Array.from({ length: 100 }, (_, index) => `synthetic-${index % 80}@lef.test`).join('\n')}\n`
        await context.route(`**/verifyBatch/${id}/results`, route =>
            route.fulfill({ contentType: 'text/csv', body: csv }),
        )
        await page.goto(`/app/verifications/batches/${id}`)
        await expect(page).toHaveTitle('Batch verification completed | Lead Email Finder')
        for (const [label, count] of [
            ['Total rows', '100'],
            ['Unique addresses', '80'],
            ['Duplicate rows', '20'],
            ['Cached addresses', '20'],
        ]) {
            await expect(page.getByText(label, { exact: true }).locator('..')).toContainText(count)
        }
        await expect(page.getByLabel('Verification charges', { exact: true })).toContainText('45 credits charged')
        await expect(
            page.getByText(
                'The result CSV retains every original row, including duplicates. Each unique address is checked once.',
                { exact: true },
            ),
        ).toBeVisible()
        const downloading = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Download result CSV', exact: true }).focus()
        await page.keyboard.press('Enter')
        const download = await downloading
        const stream = await download.createReadStream()
        if (!stream) throw new Error('CSV stream is missing')
        const chunks: Buffer[] = []
        for await (const chunk of stream) {
            if (!Buffer.isBuffer(chunk)) throw new Error('CSV stream contains invalid bytes')
            chunks.push(chunk)
        }
        expect(Buffer.concat(chunks).toString('utf8').trim().split('\n')).toHaveLength(101)
        await download.delete()
        await accessible(page)
        expect(errors).toEqual([])
        await page.screenshot({ path: `/tmp/issue577-batch-${viewport.width}.png`, fullPage: true })
    })
}

test('settlement stays distinct from reservation through offline and keyboard read recovery', async ({
    page,
    context,
}) => {
    await mockAccount(context)
    let settled = false
    let posts = 0
    page.on('request', request => {
        if (request.method() === 'POST') posts++
    })
    await context.route(`**/verifyAsync/${id}`, route =>
        route.fulfill({
            json: {
                state: 'completed',
                result,
                operation: {
                    ...operation,
                    source: 'fresh',
                    billing: settled
                        ? { state: 'settled', reserved: 1, charged: 1, reason: 'conclusive' }
                        : { state: 'pending', reserved: 1, charged: 0 },
                },
            },
        }),
    )
    await page.goto(`/app/verifications/${id}`)
    const charges = page.getByLabel('Verification charges', { exact: true })
    await expect(charges).toContainText('Settlement pending')
    await expect(charges).toContainText('1 credit initially reserved')
    await expect(charges).not.toContainText('No credits charged')
    await context.setOffline(true)
    await expect(page.getByText(/^You are offline\./)).toBeVisible()
    await expect(charges).toContainText('Settlement pending')
    const refresh = page.getByRole('button', { name: 'Refresh status', exact: true })
    await expect(refresh).toBeDisabled()
    settled = true
    await context.setOffline(false)
    await refresh.focus()
    await page.keyboard.press('Enter')
    await expect(charges).toContainText('1 credit charged')
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: '1 credit charged' }).first()).toBeVisible()
    await expect(refresh).toBeFocused()
    expect(posts).toBe(0)
    await accessible(page)
})

test('zero balance permits cached submission and manual recovery retains exactly one request key', async ({
    page,
    context,
}) => {
    await mockAccount(context)
    await context.route('**/v1/billing/summary', route =>
        route.fulfill({ json: { balance: 0, reserved: 0, available: 0 } }),
    )
    const requests: { key: string; email: string }[] = []
    await context.route('**/verifyAsync', route => {
        requests.push({
            key: route.request().headers()['idempotency-key'],
            email: (route.request().postDataJSON() as { email: string }).email,
        })
        return requests.length === 1 ? route.abort('connectionfailed') : route.fulfill({ status: 202, json: { id } })
    })
    await context.route(`**/verifyAsync/${id}`, route =>
        route.fulfill({ json: { state: 'completed', result, operation } }),
    )
    await page.goto('/app/billing')
    await expect(page.getByRole('region', { name: 'Credit balance', exact: true })).toContainText('0 credits')
    await page.goto('/app/verifications/new')
    const email = page.getByRole('textbox', { name: 'Email address', exact: true })
    await email.fill(result.email)
    await email.press('Enter')
    await expect(page.getByRole('heading', { name: 'Submission could not be confirmed', exact: true })).toBeVisible()
    await page.clock.install()
    await page.clock.fastForward(60_000)
    expect(requests).toHaveLength(1)
    const recover = page.getByRole('button', { name: 'Recover submission', exact: true })
    await recover.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Cached result', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Verification charges', { exact: true })).toContainText('No credits charged')
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(requests[0].key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    await page.reload()
    await expect(page.getByText('Cached result', { exact: true })).toBeVisible()
    expect(requests).toHaveLength(2)
    const storage = await page.evaluate(() =>
        JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    )
    expect(storage).not.toContain(result.email)
    expect(storage).not.toContain(requests[0].key)
    await accessible(page)
})

test('session replacement clears an ambiguous operation before another organization can recover it', async ({
    page,
    context,
}) => {
    let current = account
    await mockAccount(context, () => current)
    let posts = 0
    await context.route('**/verifyAsync', route => {
        posts++
        return route.abort('connectionfailed')
    })
    await page.goto('/app/verifications/new')
    const email = page.getByRole('textbox', { name: 'Email address', exact: true })
    await email.fill(result.email)
    await email.press('Enter')
    await expect(page.getByRole('button', { name: 'Recover submission', exact: true })).toBeVisible()
    current = {
        ...account,
        organization: { id: 'a75c9c01-aee7-4a08-8dad-e094e371bb3b', name: 'Replacement organization' },
        membership: { id: '44fe04d4-b3f4-4e06-85a7-1ab1c659a611', role: 'owner' },
    }
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await expect(page.getByText('Replacement organization', { exact: true }).first()).toBeAttached()
    await expect(email).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Recover submission', exact: true })).toHaveCount(0)
    await expect(page.getByText(result.email, { exact: true })).toHaveCount(0)
    expect(posts).toBe(1)
    await accessible(page)
})
