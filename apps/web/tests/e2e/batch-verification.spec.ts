import AxeBuilder from '@axe-core/playwright'
import { withAsyncVerificationFixture } from '../../../../scripts/bruno/async-verification-fixture.mjs'
import { repositoryRoot } from '../support/browser-fixture-environment'
import { test, expect } from '../support/privileged-login'

for (const width of [1440, 320]) {
    test(`owner uploads a real batch, reloads its URL, and downloads retained CSV at width ${width}`, async ({
        loginAs,
    }) => {
        await withAsyncVerificationFixture(
            repositoryRoot,
            async fixture => {
                await fixture.setBalance(2)
                const page = await loginAs('owner')
                await page.setViewportSize({ width, height: width === 320 ? 720 : 900 })
                await page.emulateMedia({ reducedMotion: 'reduce' })
                let posts = 0
                const errors: string[] = []
                page.on('pageerror', () => errors.push('pageerror'))
                page.on('request', request => {
                    if (request.method() === 'POST' && new URL(request.url()).pathname === '/verifyBatch/csv') posts++
                })
                await page.goto(`${fixture.origin}/app/verifications/batches/new`)
                await expect(page).toHaveTitle('Verify a CSV file | Lead Email Finder')
                await expect(page.getByRole('heading', { name: 'Verify a CSV file', exact: true })).toBeVisible()
                await page
                    .getByLabel('CSV file', { exact: true })
                    .setInputFiles(`${repositoryRoot}/bruno/batch-verification/fixtures/sample.csv`)
                const responsePromise = page.waitForResponse(
                    response =>
                        new URL(response.url()).pathname === '/verifyBatch/csv' &&
                        response.request().method() === 'POST',
                )
                await page.getByRole('button', { name: 'Upload and verify CSV', exact: true }).focus()
                await page.keyboard.press('Enter')
                const response = await responsePromise
                expect(response.status()).toBe(202)
                const { id } = (await response.json()) as { id: string }
                const destination = `${fixture.origin}/app/verifications/batches/${id}`
                await expect(page).toHaveURL(destination)
                await page.reload()
                await expect(page).toHaveURL(destination)
                await expect(
                    page.getByRole('heading', { name: 'Batch verification completed', exact: true }),
                ).toBeVisible({
                    timeout: 90_000,
                })
                await expect(page.getByRole('progressbar', { name: 'Batch verification progress' })).toHaveAttribute(
                    'aria-valuenow',
                    '100',
                )
                const downloaded = page.waitForEvent('download')
                await page.getByRole('button', { name: 'Download result CSV', exact: true }).click()
                const download = await downloaded
                expect(download.suggestedFilename()).toBe(`batch-verification-${id}.csv`)
                const stream = await download.createReadStream()
                expect(stream).not.toBeNull()
                const chunks: Buffer[] = []
                for await (const chunk of stream) {
                    if (!Buffer.isBuffer(chunk)) throw new Error('Expected CSV byte stream')
                    chunks.push(chunk)
                }
                const lines = Buffer.concat(chunks).toString('utf8').trim().split('\n')
                expect(lines).toHaveLength(3)
                const emailIndex = lines[0].split(',').indexOf('email')
                const reasonIndex = lines[0].split(',').indexOf('reason')
                expect(reasonIndex).toBeGreaterThanOrEqual(0)
                expect(lines.slice(1).map(line => line.split(',')[reasonIndex])).toEqual([
                    'accepted_email',
                    'accepted_email',
                ])
                expect(emailIndex).toBeGreaterThanOrEqual(0)
                expect(
                    lines
                        .slice(1)
                        .map(line => line.split(',')[emailIndex])
                        .sort(),
                ).toEqual(['other@lef.test', 'person@lef.test'])
                await download.delete()
                expect(posts).toBe(1)
                const balance = await page.request.get(`${fixture.origin}/v1/billing/summary`)
                expect(await balance.json()).toEqual({ balance: 0, reserved: 0, available: 0 })
                const accessibility = await new AxeBuilder({ page })
                    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
                    .analyze()
                expect(
                    accessibility.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? '')),
                ).toEqual([])
                expect(
                    await page.evaluate(
                        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    ),
                ).toBe(0)
                await expect(page.locator('vite-error-overlay')).toHaveCount(0)
                expect(errors).toEqual([])
            },
            { useOrganizationAdmin: true },
        )
    })
}
