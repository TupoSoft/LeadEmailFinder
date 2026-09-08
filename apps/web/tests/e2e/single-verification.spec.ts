import AxeBuilder from '@axe-core/playwright'
import { withAsyncVerificationFixture } from '../../../../scripts/bruno/async-verification-fixture.mjs'
import { repositoryRoot } from '../support/browser-fixture-environment'
import { test, expect } from '../support/privileged-login'

test('owner submits one real SMTP job, reloads its URL, then sees credit and expired-session recovery', async ({
    loginAs,
}) => {
    await withAsyncVerificationFixture(repositoryRoot, async fixture => {
        await fixture.setBalance(1)
        const page = await loginAs('owner')
        const errors: string[] = []
        const postedPaths: string[] = []
        page.on('pageerror', () => errors.push('pageerror'))
        page.on('request', request => {
            if (request.method() === 'POST') postedPaths.push(new URL(request.url()).pathname)
        })
        await page.goto(`${fixture.origin}/app/verifications/new`)
        await expect(page.getByRole('heading', { name: 'Verify an email', exact: true })).toBeVisible()
        await expect(page).toHaveTitle('Verify an email | Lead Email Finder')
        const email = page.getByRole('textbox', { name: 'Email address', exact: true })
        await email.fill('person@lef.test')
        const created = page.waitForResponse(
            response => new URL(response.url()).pathname === '/verifyAsync' && response.request().method() === 'POST',
        )
        await email.press('Enter')
        const response = await created
        expect(response.status()).toBe(202)
        const job = (await response.json()) as { id: string }
        expect(job.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
        const jobUrl = `${fixture.origin}/app/verifications/${job.id}`
        await expect(page).toHaveURL(jobUrl)
        // Reload from the server identifier immediately; this never recreates the job.
        await page.reload()
        await expect(page).toHaveURL(jobUrl)
        await expect(page.getByRole('heading', { name: 'Verification completed', exact: true })).toBeVisible({
            timeout: 70_000,
        })
        await expect(page.getByRole('heading', { name: 'Verification result', exact: true })).toBeVisible()
        await expect(page.getByText('person@lef.test', { exact: true })).toBeVisible()
        expect(postedPaths.filter(path => path === '/verifyAsync')).toHaveLength(1)
        expect(postedPaths).not.toContain('/verify')
        const status = await page.request.get(`${fixture.origin}/verifyAsync/${job.id}`)
        expect(status.status()).toBe(200)
        const completed = (await status.json()) as { state: string; result: { email: string; reason: string } }
        expect(completed.state).toBe('completed')
        expect(completed.result.email).toBe('person@lef.test')
        expect(completed.result.reason).toBe('accepted_email')
        const balance = await page.request.get(`${fixture.origin}/v1/billing/summary`)
        expect(balance.status()).toBe(200)
        expect(await balance.json()).toEqual({ balance: 0 })

        await page.setViewportSize({ width: 320, height: 720 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.getByRole('link', { name: 'Verify another email', exact: true }).click()
        await expect(page).toHaveURL(`${fixture.origin}/app/verifications/new`)
        await email.fill('invalid-address')
        await email.press('Enter')
        await expect(email).toHaveAttribute('aria-invalid', 'true')
        await expect(email).toBeFocused()
        expect(postedPaths.filter(path => path === '/verifyAsync')).toHaveLength(1)
        await email.fill('person@lef.test')
        const insufficient = page.waitForResponse(
            response => new URL(response.url()).pathname === '/verifyAsync' && response.status() === 402,
        )
        await email.press('Enter')
        await insufficient
        await expect(email).toHaveValue('person@lef.test')
        const billing = page.locator('main a[href="/app/billing"]')
        await expect(billing).toBeVisible()
        const accessibility = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        expect(accessibility.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? ''))).toEqual(
            [],
        )
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
        ).toBe(0)
        await expect(page.locator('vite-error-overlay')).toHaveCount(0)
        expect(errors).toEqual([])

        // Remove the real session cookie; the next protected request must obey the actual server 401.
        await page.context().clearCookies()
        await email.press('Enter')
        await expect(page.getByRole('heading', { name: 'Your session has expired', exact: true })).toBeVisible()
        await expect(page.getByText('person@lef.test', { exact: true })).toHaveCount(0)
        expect(postedPaths).not.toContain('/verify')
    })
})
