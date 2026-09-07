import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '../support/privileged-login'
import type { BrowserContext, Page } from '@playwright/test'

const pendingPreview = {
    organizationName: 'Northstar research',
    email: 'recipient@example.test',
    role: 'member',
    expiresAt: '2026-09-09T12:00:00.000Z',
    status: 'pending',
}

async function mockInvitation(context: BrowserContext, options: { status?: number; code?: string } = {}) {
    const token = randomUUID()
    let previews = 0
    let accepts = 0
    await context.route('**/v1/organizations/invitations/**', async route => {
        if (route.request().method() === 'POST') {
            accepts++
            await route.fulfill({ status: 201, json: { status: 'accepted' } })
        } else {
            previews++
            await route.fulfill({
                status: options.status ?? 200,
                json: options.status ? { code: options.code } : pendingPreview,
            })
        }
    })
    return { token, counts: () => ({ previews, accepts }) }
}
async function accessible(page: Page) {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? '')).length).toBe(0)
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

test('preview sanitizes history before the request, validates password and accepts without restoring secrets', async ({
    page,
    context,
}) => {
    const fixture = await mockInvitation(context)
    const errors: number[] = []
    page.on('pageerror', () => errors.push(1))
    await page.goto(`/accept-invitation/${fixture.token}`)
    await expect(page.getByText(pendingPreview.organizationName, { exact: true })).toBeVisible()
    expect(new URL(page.url()).pathname === '/accept-invitation').toBe(true)
    await expect(page).toHaveTitle('Accept invitation | Lead Email Finder')
    await accessible(page)
    const password = page.getByLabel('Password', { exact: true })
    await password.fill('short')
    await page.getByRole('button', { name: 'Accept invitation', exact: true }).click()
    await expect(password).toBeFocused()
    await expect(password).toHaveAttribute('aria-invalid', 'true')
    expect(fixture.counts().accepts).toBe(0)
    await password.fill(randomUUID())
    await page.getByRole('button', { name: 'Accept invitation', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Invitation accepted', exact: true })).toBeFocused()
    await expect(page.getByText(pendingPreview.email, { exact: true })).toHaveCount(0)
    expect(fixture.counts()).toEqual({ previews: 1, accepts: 1 })
    await accessible(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Open your invitation link' })).toBeVisible()
    expect(fixture.counts()).toEqual({ previews: 1, accepts: 1 })
    expect(errors.length).toBe(0)
})

for (const [status, code, title] of [
    [404, undefined, 'Invitation not found'],
    [410, 'invitation_expired', 'Invitation expired'],
    [410, 'invitation_consumed', 'Invitation already used'],
    [503, undefined, 'Invitation request could not be confirmed'],
] as const) {
    test(`terminal preview ${status} ${code ?? 'generic'} shows recovery without invitation details`, async ({
        page,
        context,
    }) => {
        const fixture = await mockInvitation(context, { status, code })
        await page.goto(`/accept-invitation/${fixture.token}`)
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
        await expect(page.getByText(pendingPreview.email, { exact: true })).toHaveCount(0)
        await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
        await accessible(page)
    })
}

test('full-page Back and Forward never restore a pending invitation or password', async ({ page, context }) => {
    await context.addInitScript(() => {
        window.addEventListener('pageshow', event => {
            document.documentElement.dataset.restoredFromCache = String(event.persisted)
        })
    })
    const fixture = await mockInvitation(context)
    await page.goto(`/accept-invitation/${fixture.token}`)
    await page.getByLabel('Password', { exact: true }).fill(randomUUID())
    await page.goto('/')
    await page.evaluate(() => window.history.back())
    await expect(page.getByRole('heading', { name: 'Open your invitation link' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.restoredFromCache === 'true')).toBe(true)
    expect(new URL(page.url()).pathname === '/accept-invitation').toBe(true)
    await expect(page.getByText(pendingPreview.email, { exact: true })).toHaveCount(0)
    await page.evaluate(() => window.history.forward())
    await expect(page.getByRole('heading', { name: 'Verify the signal before you send.' })).toBeVisible()
    await page.evaluate(() => window.history.back())
    await expect(page.getByRole('heading', { name: 'Open your invitation link' })).toBeVisible()
    expect(fixture.counts().previews).toBe(1)
})

test('full-page restoration discards an issued team dialog and makes no new invitation request', async ({
    page,
    context,
}) => {
    let issues = 0
    await context.route('**/v1/auth/session', route =>
        route.fulfill({
            json: {
                email: 'owner@example.test',
                membership: { id: 'membership', role: 'owner' },
                organization: { id: 'organization', name: 'Northstar research' },
                capabilities: ['team.manage'],
                grantableServiceClientPermissions: [],
            },
        }),
    )
    await context.route('**/v1/organizations/organization/members', route => route.fulfill({ json: [] }))
    await context.route('**/v1/organizations/organization/invitations', route => {
        issues++
        return route.fulfill({
            status: 201,
            json: {
                id: randomUUID(),
                email: 'recipient@example.test',
                role: 'member',
                expiresAt: '2026-09-09T12:00:00Z',
                token: randomUUID(),
            },
        })
    })
    await page.goto('/app/team')
    await page.getByLabel('Email address', { exact: true }).fill('recipient@example.test')
    await page.getByRole('button', { name: 'Create invitation', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Invitation created', exact: true })).toBeVisible()
    await page.goto('/')
    await page.evaluate(() => window.history.back())
    await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
    await expect(page.getByLabel('Invitation link', { exact: true })).toHaveCount(0)
    expect(issues).toBe(1)
})

test('delayed preview cannot repaint private details after pagehide or restored pageshow', async ({
    page,
    context,
}) => {
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    await context.route('**/v1/organizations/invitations/**', async route => {
        await pending
        await route.fulfill({ json: pendingPreview }).catch(() => undefined)
    })
    await page.goto(`/accept-invitation/${randomUUID()}`)
    await expect(page.getByText('Loading your invitation…')).toBeVisible()
    await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    })
    release()
    await expect(page.getByRole('heading', { name: 'Open your invitation link' })).toBeVisible()
    await expect(page.getByText(pendingPreview.email, { exact: true })).toHaveCount(0)
})
