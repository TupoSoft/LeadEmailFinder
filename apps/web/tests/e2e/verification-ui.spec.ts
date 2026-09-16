import AxeBuilder from '@axe-core/playwright'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
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
    email: 'a-long.synthetic.research-address@an-extremely-long-domain-name.lef.test',
    localPart: 'a-long.synthetic.research-address',
    domain: 'an-extremely-long-domain-name.lef.test',
    exists: null,
    catchAll: false,
    reason: 'timeout',
    sources: ['mx', 'microsoft_1', 'linkedin'],
    mxDomain: 'mail.an-extremely-long-domain-name.lef.test',
    targetExchange: 'smtp.an-extremely-long-domain-name.lef.test',
}

async function mockAccount(context: BrowserContext, capabilities = account.capabilities) {
    await context.route('**/v1/auth/session', route => route.fulfill({ json: { ...account, capabilities } }))
    await context.route('**/v1/billing/summary', route =>
        route.fulfill({ json: { balance: 10, reserved: 0, available: 10 } }),
    )
}

async function accessible(page: Page) {
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(a11y.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? ''))).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
        0,
    )
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

for (const state of ['queued', 'running', 'completed', 'failed', 'unavailable']) {
    test(`${state} has safe distinct copy, accessible geometry, and truthful result signals`, async ({
        page,
        context,
    }) => {
        await mockAccount(context)
        const errors: string[] = []
        page.on('pageerror', () => errors.push('pageerror'))
        page.on('console', message => {
            if (message.type() === 'error') errors.push('console error')
        })
        let reads = 0
        await context.route(`**/verifyAsync/${id}`, route => {
            reads++
            return route.fulfill({
                json: {
                    state,
                    ...(state === 'completed'
                        ? { result }
                        : state === 'failed'
                          ? { failureCode: 'verification_failed' }
                          : {}),
                },
            })
        })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto(`/app/verifications/${id}`)
        await expect(page.getByRole('heading', { name: `Verification ${state}`, exact: true })).toBeVisible()
        await expect(page).toHaveTitle(`Verification ${state} | Lead Email Finder`)
        if (state === 'completed') {
            const details = page.getByRole('region', { name: 'Verification result', exact: true })
            await expect(details).toContainText(result.email)
            await expect(details).toContainText('Unknown')
            await expect(details).toContainText('No')
            await expect(details).toContainText('The check timed out before a reliable answer was available.')
            await expect(details.getByText('Address pattern', { exact: true })).toHaveCount(0)
            await expect(page.getByRole('heading', { name: 'Verification result', exact: true })).toBeFocused()
            await expect(
                page
                    .locator('main [aria-live="polite"][aria-atomic="true"]')
                    .filter({ hasText: 'Verification completed' }),
            ).toContainText('Verification completed')
            const [detailsBounds, refreshBounds, anotherBounds, descriptionBounds] = await Promise.all([
                details.boundingBox(),
                page.getByRole('button', { name: 'Refresh status', exact: true }).boundingBox(),
                page.getByRole('link', { name: 'Verify another email', exact: true }).boundingBox(),
                page
                    .getByText('The verification finished. Review the individual signals and their limits below.', {
                        exact: true,
                    })
                    .boundingBox(),
            ])
            expect(detailsBounds).not.toBeNull()
            expect(refreshBounds).not.toBeNull()
            expect(anotherBounds).not.toBeNull()
            expect(descriptionBounds).not.toBeNull()
            // Check the lowest button on narrow layouts, where the actions can wrap onto separate rows.
            const actionsBottom = Math.max(
                refreshBounds!.y + refreshBounds!.height,
                anotherBounds!.y + anotherBounds!.height,
            )
            expect(detailsBounds!.y - actionsBottom).toBeGreaterThanOrEqual(24)
            const descriptionToActions =
                Math.min(refreshBounds!.y, anotherBounds!.y) - (descriptionBounds!.y + descriptionBounds!.height)
            expect(descriptionToActions).toBeGreaterThanOrEqual(24)
            expect(descriptionToActions).toBeLessThanOrEqual(48)
            await page.screenshot({
                path: `/tmp/issue506-verification-${page.viewportSize()!.width > 500 ? 'desktop' : 'narrow'}.png`,
                fullPage: true,
            })
        }
        await accessible(page)
        expect(errors).toEqual([])
        if (['completed', 'failed', 'unavailable'].includes(state)) {
            await page.clock.install()
            const before = reads
            await page.clock.fastForward(20_000)
            expect(reads).toBe(before)
            const refresh = page.getByRole('button', { name: 'Refresh status', exact: true })
            await refresh.click()
            await expect.poll(() => reads).toBe(before + 1)
            await expect(refresh).toBeEnabled()
            if (state === 'completed')
                await expect(page.getByRole('heading', { name: 'Verification result', exact: true })).not.toBeFocused()
        }
    })
}

test('completed evidence keeps visible offline and stale recovery messages without refocusing the result', async ({
    page,
    context,
}) => {
    await mockAccount(context)
    let failed = false
    await context.route(`**/verifyAsync/${id}`, route =>
        route.fulfill({ status: failed ? 503 : 200, json: failed ? {} : { state: 'completed', result } }),
    )
    await page.goto(`/app/verifications/${id}`)
    const details = page.getByRole('region', { name: 'Verification result', exact: true })
    const refresh = page.getByRole('button', { name: 'Refresh status', exact: true })
    await expect(page.getByRole('heading', { name: 'Verification result', exact: true })).toBeFocused()

    await context.setOffline(true)
    await expect(page.getByRole('heading', { name: 'Verification offline', exact: true })).toBeVisible()
    await expect(page.getByText(/^You are offline\./)).toBeVisible()
    await expect(page.getByText('Last confirmed status: Verification completed', { exact: true })).toBeVisible()
    await expect(details).toContainText(result.email)
    await expect(refresh).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Verify another email', exact: true })).toBeVisible()

    await context.setOffline(false)
    await expect(page.getByRole('heading', { name: 'Verification completed', exact: true })).toBeVisible()
    await expect(refresh).toBeEnabled()
    failed = true
    await refresh.click()
    await expect(page.getByRole('heading', { name: 'Verification status out of date', exact: true })).toBeVisible()
    await expect(page.getByText('The latest read failed.', { exact: false })).toBeVisible()
    await expect(details).toContainText(result.email)
    await expect(refresh).toBeEnabled()
    await expect(page.getByRole('heading', { name: 'Verification result', exact: true })).not.toBeFocused()
    await accessible(page)

    failed = false
    await refresh.click()
    await expect(page.getByRole('heading', { name: 'Verification completed', exact: true })).toBeVisible()
    await expect(page.getByText('The latest read failed.', { exact: false })).toHaveCount(0)
    await expect(page.getByText(/^You are offline\./)).toHaveCount(0)
    await expect(details).toContainText(result.email)
    await expect(refresh).toBeEnabled()
    await expect(page.getByRole('heading', { name: 'Verification result', exact: true })).not.toBeFocused()
})

test('keyboard form validation and keyed recovery prevent duplicate work until a deliberate recovery', async ({
    page,
    context,
}) => {
    await mockAccount(context)
    let posts = 0
    const requestKeys: string[] = []
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    await context.route('**/verifyAsync', async route => {
        posts++
        expect(route.request().postDataJSON()).toEqual({ email: 'person@lef.test' })
        requestKeys.push(route.request().headers()['idempotency-key'])
        await pending
        await route.abort('connectionfailed')
    })
    await page.goto('/app/verifications/new')
    const email = page.getByRole('textbox', { name: 'Email address', exact: true })
    await email.fill('invalid')
    await email.press('Enter')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toBeFocused()
    expect(posts).toBe(0)
    await email.fill('person@lef.test')
    await email.press('Enter')
    const submit = page.getByRole('button', { name: 'Verify email', exact: true })
    await expect(submit).toBeDisabled()
    await page.keyboard.press('Enter')
    expect(posts).toBe(1)
    release()
    await expect(page.getByRole('heading', { name: 'Submission could not be confirmed', exact: true })).toBeVisible()
    const recover = page.getByRole('button', { name: 'Recover submission', exact: true })
    await expect(recover).toBeEnabled()
    await expect(email).toHaveAttribute('readonly')
    await expect(email).toHaveValue('person@lef.test')
    await expect(page).toHaveURL(/\/app\/verifications\/new$/)
    await page.clock.install()
    await page.clock.fastForward(60_000)
    expect(posts).toBe(1)
    await recover.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => posts).toBe(2)
    expect(requestKeys[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(requestKeys[1]).toBe(requestKeys[0])
    await expect(recover).toBeEnabled()
    await accessible(page)
})

for (const canReadBilling of [true, false]) {
    test(`402 preserves input and offers ${canReadBilling ? 'billing' : 'owner guidance'} based on capability`, async ({
        page,
        context,
    }) => {
        await mockAccount(context, canReadBilling ? account.capabilities : ['verification.run', 'verification.read'])
        await context.route('**/verifyAsync', route => route.fulfill({ status: 402, json: { statusCode: 402 } }))
        await page.goto('/app/verifications/new')
        const email = page.getByRole('textbox', { name: 'Email address', exact: true })
        await email.fill('person@lef.test')
        await email.press('Enter')
        await expect(page.getByRole('heading', { name: 'Insufficient credits', exact: true })).toBeVisible()
        await expect(email).toHaveValue('person@lef.test')
        await expect(page.getByRole('link', { name: 'Go to billing', exact: true })).toHaveCount(canReadBilling ? 1 : 0)
        if (!canReadBilling)
            await expect(
                page.getByText('Contact an organization owner to arrange more credits.', { exact: true }),
            ).toBeVisible()
        await accessible(page)
    })
}

test('polling pauses offline and hidden, retains stale state, and resumes only read recovery', async ({
    page,
    context,
}) => {
    await mockAccount(context)
    let reads = 0
    let failed = false
    await context.route(`**/verifyAsync/${id}`, route => {
        reads++
        return route.fulfill({ status: failed ? 503 : 200, json: failed ? {} : { state: 'running' } })
    })
    await page.goto(`/app/verifications/${id}`)
    await expect(page.getByRole('heading', { name: 'Verification running', exact: true })).toBeVisible()
    await page.clock.install()
    await context.setOffline(true)
    await expect(page.getByText(/^You are offline\./)).toBeVisible()
    const before = reads
    await page.clock.fastForward(20_000)
    expect(reads).toBe(before)
    await context.setOffline(false)
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(
        page.getByText('Automatic status checks are paused while this page is hidden.', { exact: true }),
    ).toBeVisible()
    await page.clock.fastForward(20_000)
    expect(reads).toBe(before)
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
    })
    failed = true
    await page.clock.fastForward(6000)
    await expect(page.getByText('The latest read failed.', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Verification status out of date', exact: true })).toBeVisible()
    await expect(page.getByText('Last confirmed status: Verification running', { exact: true })).toBeVisible()
    const staleReads = reads
    await page.clock.fastForward(20_000)
    expect(reads).toBe(staleReads)
    failed = false
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click()
    await expect(page.getByText('The latest read failed.', { exact: false })).toHaveCount(0)
    await accessible(page)
})

test('malformed and concealed job identifiers use the same non-disclosing not-found view', async ({
    page,
    context,
}) => {
    await mockAccount(context)
    let reads = 0
    await context.route('**/verifyAsync/**', route => {
        reads++
        return route.fulfill({ status: 404, json: { statusCode: 404, message: 'private details must not render' } })
    })
    await page.goto('/app/verifications/not-a-uuid')
    await expect(page.getByRole('heading', { name: 'Verification not found', exact: true })).toBeVisible()
    expect(reads).toBe(0)
    await page.goto(`/app/verifications/${id}`)
    await expect(page.getByRole('heading', { name: 'Verification not found', exact: true })).toBeVisible()
    expect(reads).toBe(1)
    await expect(page.getByText('private details must not render', { exact: false })).toHaveCount(0)
    await accessible(page)
})
