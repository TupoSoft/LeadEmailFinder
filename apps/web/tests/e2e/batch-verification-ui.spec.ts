import AxeBuilder from '@axe-core/playwright'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'

const id = '725d7b63-6a47-4d14-8709-f2966f5a0948'
const capabilities = ['verification.run', 'verification.read', 'billing.read']
async function account(context: BrowserContext, allowed = capabilities) {
    await context.route('**/v1/auth/session', route =>
        route.fulfill({
            json: {
                organization: { id: 'd15c682a-9354-4378-af6c-a456fb661d1f', name: 'Northstar research' },
                membership: { id: 'ee8c7d63-cba5-4e01-800e-8d715b8b83fa', role: 'owner' },
                email: 'owner@example.test',
                capabilities: allowed,
                grantableServiceClientPermissions: [],
            },
        }),
    )
}
const zeroCounts = {
    totalRows: 0,
    uniqueAddresses: 0,
    duplicateRows: 0,
    cachedAddresses: 0,
    sharedAddresses: 0,
    cooldownAddresses: 0,
    completedAddresses: 0,
    conclusiveAddresses: 0,
    inconclusiveAddresses: 0,
    failedAddresses: 0,
}
const snapshot = (status: string, extra = {}) => ({
    id,
    status,
    progress: status === 'completed' ? 100 : 37.5,
    total: 80,
    processed: status === 'completed' ? 80 : 30,
    unprocessed: status === 'completed' ? 0 : 50,
    resultsAvailable: status === 'completed',
    counts: { ...zeroCounts, totalRows: 80, uniqueAddresses: 80 },
    billing: { state: status === 'completed' ? 'settled' : 'pending', reserved: 80, charged: 0 },
    ...extra,
})
async function accessible(page: Page) {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? ''))).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
        0,
    )
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

for (const status of ['queued', 'running', 'completed', 'unavailable']) {
    test(`${status} uses server progress with accessible geometry and bounded reads`, async ({ page, context }) => {
        await account(context)
        let reads = 0
        const errors: string[] = []
        page.on('pageerror', () => errors.push('pageerror'))
        page.on('console', message => {
            if (message.type() === 'error') errors.push('console error')
        })
        await context.route(`**/verifyBatch/${id}`, route => {
            reads++
            return route.fulfill({ json: snapshot(status) })
        })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto(`/app/verifications/batches/${id}`)
        await expect(page.getByRole('heading', { name: `Batch verification ${status}`, exact: true })).toBeVisible()
        await expect(page).toHaveTitle(`Batch verification ${status} | Lead Email Finder`)
        const progress = page.getByRole('progressbar', { name: 'Batch verification progress' })
        await expect(progress).toHaveAttribute('aria-valuenow', String(status === 'completed' ? 100 : 37.5))
        await expect(page.getByText('80', { exact: true }).first()).toBeVisible()
        await accessible(page)
        expect(errors).toEqual([])
        if (['completed', 'unavailable'].includes(status)) {
            await page.clock.install()
            const before = reads
            await page.clock.fastForward(60_000)
            expect(reads).toBe(before)
        }
        if (status === 'completed') {
            await expect(page.getByRole('button', { name: 'Download result CSV', exact: true })).toBeEnabled()
            await page.screenshot({
                path: `/tmp/issue507-batch-${page.viewportSize()!.width > 500 ? 'desktop' : 'narrow'}.png`,
                fullPage: true,
            })
        } else {
            await expect(page.getByRole('button', { name: 'Download result CSV', exact: true })).toHaveCount(0)
        }
    })
}

for (const [failureCode, title] of [
    ['invalid_csv', 'CSV validation failed'],
    ['insufficient_credits', 'Insufficient credits'],
    ['processing_failed', 'Batch processing failed'],
]) {
    test(`${failureCode} explains safe recovery without resubmission`, async ({ page, context }) => {
        await account(context)
        let posts = 0
        page.on('request', request => {
            if (request.method() === 'POST') posts++
        })
        await context.route(`**/verifyBatch/${id}`, route =>
            route.fulfill({ json: snapshot('failed', { failureCode }) }),
        )
        await page.goto(`/app/verifications/batches/${id}`)
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
        if (failureCode === 'processing_failed')
            await expect(page.getByText(/Credits may have been charged/)).toBeVisible()
        if (failureCode === 'insufficient_credits')
            await expect(page.getByRole('link', { name: 'Go to billing', exact: true })).toBeVisible()
        await accessible(page)
        expect(posts).toBe(0)
    })
}

test('native picker validates, removes, uploads once, and reacquires the real job after reload', async ({
    page,
    context,
}) => {
    await account(context)
    let posts = 0
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    await context.route('**/verifyBatch/csv', async route => {
        posts++
        expect(route.request().headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/)
        await pending
        await route.fulfill({ status: 202, json: { id } })
    })
    await context.route(`**/verifyBatch/${id}`, route => route.fulfill({ json: snapshot('running') }))
    await page.goto('/app/verifications/batches/new')
    const picker = page.getByLabel('CSV file', { exact: true })
    await picker.setInputFiles({
        name: 'wrong.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('email\nperson@lef.test'),
    })
    await expect(picker).toHaveAttribute('aria-invalid', 'true')
    await expect(picker).toBeFocused()
    expect(posts).toBe(0)
    await picker.setInputFiles({
        name: `${'synthetic-long-filename-'.repeat(8)}.csv`,
        mimeType: '',
        buffer: Buffer.from('email\nperson@lef.test'),
    })
    await expect(page.getByRole('button', { name: 'Remove file', exact: true })).toBeEnabled()
    await accessible(page)
    await page.screenshot({
        path: `/tmp/issue507-picker-${page.viewportSize()!.width > 500 ? 'desktop' : 'narrow'}.png`,
        fullPage: true,
    })
    await page.getByRole('button', { name: 'Remove file', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Remove file', exact: true })).toHaveCount(0)
    await picker.setInputFiles({
        name: 'synthetic.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('email\nperson@lef.test'),
    })
    const submit = page.getByRole('button', { name: 'Upload and verify CSV', exact: true })
    await submit.focus()
    await page.keyboard.press('Enter')
    await expect(submit).toBeDisabled()
    await expect(picker).toBeDisabled()
    await expect(page.getByRole('progressbar', { name: 'Uploading CSV', exact: true })).not.toHaveAttribute(
        'aria-valuenow',
    )
    await page.keyboard.press('Enter')
    expect(posts).toBe(1)
    release()
    await expect(page).toHaveURL(`/app/verifications/batches/${id}`)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Batch verification running', exact: true })).toBeVisible()
    expect(posts).toBe(1)
})

test('uncertain upload clears selection and requires deliberate acknowledgment and a fresh file', async ({
    page,
    context,
}) => {
    await account(context)
    let posts = 0
    await context.route('**/verifyBatch/csv', route => {
        posts++
        return route.abort('connectionfailed')
    })
    await page.goto('/app/verifications/batches/new')
    const picker = page.getByLabel('CSV file', { exact: true })
    await picker.setInputFiles({
        name: 'synthetic.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('email\nperson@lef.test'),
    })
    await page.getByRole('button', { name: 'Upload and verify CSV', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Upload could not be confirmed', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload could not be confirmed', exact: true })).toBeFocused()
    await expect(picker).toHaveValue('')
    await expect(picker).toBeDisabled()
    await page.clock.install()
    await page.clock.fastForward(60_000)
    expect(posts).toBe(1)
    const fresh = page.getByRole('button', { name: 'Choose a fresh file', exact: true })
    await expect(fresh).toBeDisabled()
    await page.getByRole('checkbox').check()
    await fresh.click()
    await expect(picker).toBeEnabled()
    await expect(picker).toHaveValue('')
    expect(posts).toBe(1)
    await accessible(page)
})

test('download retries only GET and a later missing result keeps completion truthful', async ({ page, context }) => {
    await account(context)
    await context.route(`**/verifyBatch/${id}`, route => route.fulfill({ json: snapshot('completed') }))
    let downloads = 0
    let missing = false
    await context.route(`**/verifyBatch/${id}/results`, route => {
        downloads++
        return route.fulfill({ status: missing ? 404 : 503, json: {} })
    })
    await page.goto(`/app/verifications/batches/${id}`)
    const download = page.getByRole('button', { name: 'Download result CSV', exact: true })
    await download.click()
    await expect(page.getByText(/The result could not be downloaded/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Batch verification completed', exact: true })).toBeVisible()
    await expect(download).toBeEnabled()
    missing = true
    await download.click()
    await expect(page.getByText('Result no longer available', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Result no longer available', exact: true })).toBeFocused()
    expect(downloads).toBe(2)
    await accessible(page)
})

test('offline and failed reads preserve confirmed counts and manual recovery', async ({ page, context }) => {
    await account(context)
    let fail = false
    await context.route(`**/verifyBatch/${id}`, route =>
        route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : snapshot('running') }),
    )
    await page.goto(`/app/verifications/batches/${id}`)
    await expect(page.getByText('80', { exact: true }).first()).toBeVisible()
    await context.setOffline(true)
    await expect(page.getByText(/^You are offline/)).toBeVisible()
    await expect(page.getByText('80', { exact: true }).first()).toBeVisible()
    await context.setOffline(false)
    fail = true
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click()
    await expect(page.getByText(/^The latest read failed/)).toBeVisible()
    await expect(page.getByText('80', { exact: true }).first()).toBeVisible()
    await accessible(page)
})
