import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '../support/privileged-login'
import { browserFixtureEnvironment } from '../support/browser-fixture-environment'

test('owner issues one link, recipient previews and accepts, and owner changes then disables membership', async ({
    loginAs,
    browser,
}) => {
    const { origin } = await browserFixtureEnvironment()
    const owner = await loginAs('owner')
    await owner.goto(`${origin}/app/team`)
    await expect(owner.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
    const email = `team-${randomUUID()}@example.test`
    await owner.getByLabel('Email address', { exact: true }).fill(email)
    await owner.getByRole('button', { name: 'Create invitation', exact: true }).click()
    const link = owner.getByLabel('Invitation link', { exact: true })
    await expect(link).toBeVisible()
    let url = await link.inputValue()
    expect(new URL(url).origin === origin).toBe(true)
    await owner.getByRole('button', { name: 'Copy invitation link', exact: true }).click()
    await expect(link).toHaveCount(0)
    const recipient = await browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
        const page = await recipient.newPage()
        const documentResponse = await page.goto(url)
        url = ''
        expect(documentResponse?.headers()['cache-control']).toBe('no-store')
        expect(documentResponse?.headers()['referrer-policy']).toBe('no-referrer')
        await expect(page.getByRole('heading', { name: 'Accept invitation', exact: true })).toBeVisible()
        await expect(page.getByText(email, { exact: true })).toBeVisible()
        expect(new URL(page.url()).pathname === '/accept-invitation').toBe(true)
        const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
        expect(a11y.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? '')).length).toBe(0)
        const acceptResponse = page.waitForResponse(
            response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/accept'),
        )
        await page.getByLabel('Password', { exact: true }).fill(randomUUID())
        await page.getByRole('button', { name: 'Accept invitation', exact: true }).click()
        expect((await acceptResponse).status()).toBe(201)
        await expect(page.getByRole('heading', { name: 'Invitation accepted', exact: true })).toBeVisible()
        await expect(page.getByText(email, { exact: true })).toHaveCount(0)
        await page.goto(`${origin}/`)
        await page.evaluate(() => window.history.back())
        await expect(page.getByRole('heading', { name: 'Open your invitation link', exact: true })).toBeVisible()
        await owner.getByRole('button', { name: 'Refresh members', exact: true }).click()
        const row = owner.getByRole('row').filter({ hasText: email })
        await expect(row).toBeVisible()
        await row.getByRole('combobox').selectOption('admin')
        const roleResponse = owner.waitForResponse(response => response.request().method() === 'PATCH')
        await row.getByRole('button', { name: `Save role for ${email}` }).click()
        expect((await roleResponse).status()).toBe(200)
        await expect(row.getByRole('combobox')).toHaveValue('admin')
        await expect(owner.getByText('The role was updated.')).toBeVisible()
        await row.getByRole('button', { name: `Disable access for ${email}` }).click()
        const confirmation = owner.getByRole('dialog', { name: 'Disable member access?' })
        await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
        await confirmation.getByRole('button', { name: 'Disable access', exact: true }).click()
        await expect(row.getByText('Disabled', { exact: true })).toBeVisible()
        await expect(row.getByRole('combobox')).toHaveCount(0)
    } finally {
        url = ''
        await recipient.close()
    }
})
