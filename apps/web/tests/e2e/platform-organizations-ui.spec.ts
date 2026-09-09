import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '../support/privileged-login'
import type { BrowserContext, Page } from '@playwright/test'

const row = (name: string, id = randomUUID()) => ({
    id,
    name,
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
})
async function account(context: BrowserContext, capabilities = ['platform.organizations.manage']) {
    await context.route('**/v1/auth/session', route =>
        route.fulfill({
            json: {
                email: 'operator@example.test',
                membership: { id: 'platform-membership', role: 'platform_admin' },
                organization: { id: 'platform', name: 'Platform workspace' },
                capabilities,
                grantableServiceClientPermissions: [],
            },
        }),
    )
}
async function accessible(page: Page) {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? '')).length).toBe(0)
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}
async function fill(page: Page) {
    await page.getByLabel('Organization name', { exact: true }).fill('Northstar research')
    await page.getByLabel('First owner email', { exact: true }).fill('owner@example.test')
    await page.getByRole('button', { name: 'Create organization', exact: true }).click()
}

test('directory follows opaque cursors, appends unique metadata, and has no invented total', async ({
    page,
    context,
}) => {
    await account(context)
    const first = row('Northstar research')
    const second = row('Long organization name for a narrow screen with meaningful wrapping')
    const cursors: (string | null)[] = []
    const errors: number[] = []
    page.on('pageerror', () => errors.push(1))
    page.on('console', message => {
        if (message.type() === 'error') errors.push(1)
    })
    await context.route('**/v1/organizations?*', route => {
        const cursor = new URL(route.request().url()).searchParams.get('pageToken')
        cursors.push(cursor)
        return route.fulfill({
            json: cursor
                ? { organizations: [first, second] }
                : { organizations: [first], nextPageToken: 'opaque_cursor-unchanged' },
        })
    })
    await page.goto('/app/platform/organizations')
    await expect(page).toHaveTitle('Organizations | Lead Email Finder')
    await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible()
    await expect(page.getByText(first.name, { exact: true })).toBeVisible()
    await accessible(page)
    await page.getByRole('button', { name: 'Load more', exact: true }).click()
    await expect(page.getByText(second.name, { exact: true })).toBeVisible()
    await expect(page.getByText(first.name, { exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0)
    expect(cursors).toEqual([null, 'opaque_cursor-unchanged'])
    expect(await page.getByRole('main').innerText()).not.toMatch(/total|last page|page \d+ of/i)
    await accessible(page)
    expect(errors.length).toBe(0)
})

test('customer navigation omits platform organizations and direct access is denied', async ({ page, context }) => {
    await account(context, ['team.manage'])
    let reads = 0
    await context.route('**/v1/organizations?*', route => {
        reads++
        return route.fulfill({ json: { organizations: [] } })
    })
    await page.goto('/app/platform/organizations')
    await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Organizations', exact: true })).toHaveCount(0)
    expect(reads).toBe(0)
    await accessible(page)
})

test('creation validates fields, copies once, clears secret and refreshes the first page', async ({
    page,
    context,
}) => {
    await account(context)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const organization = row('Northstar research')
    let creations = 0
    let reads = 0
    let secret: string = randomUUID()
    await context.route('**/v1/organizations**', route => {
        if (route.request().method() === 'POST') {
            creations++
            return route.fulfill({
                status: 201,
                headers: { 'cache-control': 'no-store' },
                json: {
                    organizationId: organization.id,
                    invitation: {
                        id: randomUUID(),
                        email: 'owner@example.test',
                        role: 'owner',
                        expiresAt: '2026-09-16T12:00:00Z',
                        token: secret,
                    },
                },
            })
        }
        reads++
        return route.fulfill({ json: { organizations: creations ? [organization] : [] } })
    })
    await page.goto('/app/platform/organizations')
    await expect(
        page.getByText('No organizations to show. Create an organization to invite its first owner.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Create organization', exact: true }).click()
    await expect(page.getByLabel('Organization name', { exact: true })).toBeFocused()
    expect(creations).toBe(0)
    await accessible(page)
    await fill(page)
    const dialog = page.getByRole('dialog', { name: 'Organization created', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Copy invitation link', exact: true })).toBeFocused()
    expect((await page.getByLabel('First owner invitation link', { exact: true }).inputValue()).includes(secret)).toBe(
        true,
    )
    expect(
        await page.evaluate(value => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(value), secret),
    ).toBe(false)
    await accessible(page)
    await dialog.getByRole('button', { name: 'Copy invitation link', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect((await page.evaluate(() => navigator.clipboard.readText())).includes(secret)).toBe(true)
    await page.evaluate(() => navigator.clipboard.writeText(''))
    expect((await page.content()).includes(secret)).toBe(false)
    secret = ''
    await expect(page.getByText(organization.name, { exact: true })).toBeVisible()
    expect(creations).toBe(1)
    expect(reads).toBeGreaterThan(1)
})

for (const boundary of ['cancel', 'pagehide', 'navigation'] as const) {
    test(`late creation after ${boundary} stays dismissed and requires reconciliation`, async ({ page, context }) => {
        await account(context)
        let creations = 0
        let release!: () => void
        const pending = new Promise<void>(resolve => {
            release = resolve
        })
        await context.route('**/v1/organizations**', async route => {
            if (route.request().method() !== 'POST') return route.fulfill({ json: { organizations: [] } })
            creations++
            await pending
            await route
                .fulfill({
                    status: 201,
                    json: {
                        organizationId: randomUUID(),
                        invitation: {
                            id: randomUUID(),
                            email: 'owner@example.test',
                            role: 'owner',
                            expiresAt: '2026-09-16T12:00:00Z',
                            token: randomUUID(),
                        },
                    },
                })
                .catch(() => undefined)
        })
        await page.goto('/app/platform/organizations')
        await fill(page)
        await expect(page.getByText('Creating organization…', { exact: true })).toBeVisible()
        if (boundary === 'cancel') await page.getByRole('button', { name: 'Cancel waiting', exact: true }).click()
        else if (boundary === 'pagehide')
            await page.evaluate(() => {
                window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
                window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
            })
        else {
            if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
                await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
            await page.getByRole('link', { name: 'Home', exact: true }).click()
            if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
                await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
            await page.getByRole('link', { name: 'Organizations', exact: true }).click()
        }
        release()
        await expect(
            page.getByRole('button', { name: 'I have reconciled the unconfirmed creation', exact: true }),
        ).toBeVisible()
        await expect(page.getByRole('button', { name: 'Create organization', exact: true })).toBeDisabled()
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByLabel('First owner invitation link', { exact: true })).toHaveCount(0)
        expect(creations).toBe(1)
    })
}

test('lost response reconciles the directory and requires an explicit operator decision', async ({ page, context }) => {
    await account(context)
    let creations = 0
    await context.route('**/v1/organizations**', route => {
        if (route.request().method() === 'POST') {
            creations++
            return route.abort('failed')
        }
        return route.fulfill({ json: { organizations: creations ? [row('Unconfirmed organization')] : [] } })
    })
    await page.goto('/app/platform/organizations')
    await fill(page)
    await expect(page.getByText('Unconfirmed organization', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create organization', exact: true })).toBeDisabled()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Create organization', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'I have reconciled the unconfirmed creation', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Create organization', exact: true })).toBeEnabled()
    expect(creations).toBe(1)
    await accessible(page)
})

test('full-page Back restoration never restores a one-time invitation', async ({ page, context }) => {
    await account(context)
    await context.addInitScript(() =>
        window.addEventListener('pageshow', event => {
            document.documentElement.dataset.restoredFromCache = String(event.persisted)
        }),
    )
    let creations = 0
    await context.route('**/v1/organizations**', route => {
        if (route.request().method() !== 'POST') return route.fulfill({ json: { organizations: [] } })
        creations++
        return route.fulfill({
            status: 201,
            json: {
                organizationId: randomUUID(),
                invitation: {
                    id: randomUUID(),
                    email: 'owner@example.test',
                    role: 'owner',
                    expiresAt: '2026-09-16T12:00:00Z',
                    token: randomUUID(),
                },
            },
        })
    })
    await page.goto('/app/platform/organizations')
    await fill(page)
    await expect(page.getByRole('dialog', { name: 'Organization created', exact: true })).toBeVisible()
    await page.goto('/')
    await page.evaluate(() => window.history.back())
    await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.restoredFromCache === 'true')).toBe(true)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByLabel('First owner invitation link', { exact: true })).toHaveCount(0)
    expect(creations).toBe(1)
})
