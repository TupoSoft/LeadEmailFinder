import { randomBytes, randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from '../support/privileged-login'
import {
    installServiceClientExportSink,
    serviceClientExportEvidence,
    setExportFailures,
} from '../support/service-client-exports'
import { serviceClientsCopy as copy } from '../../src/features/service-clients/service-clients-copy'

const organizationId = '3b885bd2-6360-428f-a61e-ef90bef32f89'
const collection = `/v1/organizations/${organizationId}/service-clients`
const clients = [
    {
        id: 'b9965cfa-6f52-4faa-a7e8-ebcd0b875aaa',
        keyPrefix: 'lef_abcd1234',
        description: 'Research delivery worker',
        permissions: ['verification:run'],
        status: 'active',
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-01T12:00:00Z',
    },
    {
        id: '29965cfa-6f52-4faa-a7e8-ebcd0b875aaa',
        keyPrefix: 'lef_efgh5678',
        description: 'Archived research integration',
        permissions: ['verification:read'],
        status: 'disabled',
        createdAt: '2026-09-01T12:00:00Z',
        updatedAt: '2026-09-02T12:00:00Z',
    },
]
const grants = ['verification:read', 'verification:run']

async function mockAccount(context: BrowserContext, allowed = true) {
    await context.route('**/v1/auth/session', route =>
        route.fulfill({
            json: {
                email: 'owner@example.test',
                membership: { id: 'owner', role: 'owner' },
                organization: { id: organizationId, name: 'Northstar research' },
                capabilities: allowed ? ['service_clients.manage'] : [],
                grantableServiceClientPermissions: grants,
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

async function create(page: Page) {
    await page.getByLabel(copy.descriptionLabel, { exact: true }).fill('Disposable integration')
    await page.getByRole('checkbox', { name: 'verification:run', exact: true }).check()
    await page.getByRole('button', { name: copy.create, exact: true }).click()
}

const secretDialog = (page: Page) => page.getByRole('dialog', { name: copy.secretTitle, exact: true })

test('server permission choices and ordered active/disabled metadata remain accessible at both widths', async ({
    page,
    context,
}) => {
    await mockAccount(context)
    await context.route(`**${collection}`, route => route.fulfill({ json: clients }))
    const errors: number[] = []
    page.on('pageerror', () => errors.push(1))
    page.on('console', message => {
        if (message.type() === 'error') errors.push(1)
    })
    await page.goto('/app/service-clients')
    await expect(page).toHaveTitle('API keys | Lead Email Finder')
    await expect(page.getByRole('heading', { name: copy.title, exact: true })).toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(grants.length)
    for (let index = 0; index < grants.length; index++) {
        await expect(page.getByRole('checkbox').nth(index)).toHaveAccessibleName(grants[index])
    }
    const rows = page.getByRole('row')
    await expect(rows.nth(1)).toContainText(clients[0].keyPrefix)
    await expect(rows.nth(2)).toContainText(clients[1].keyPrefix)
    await expect(rows.nth(2)).toContainText('Disabled')
    const disabledRotate = page.getByRole('button', { name: `Rotate API key ${clients[1].keyPrefix}`, exact: true })
    expect((await disabledRotate.count()) === 0 || (await disabledRotate.isDisabled())).toBe(true)
    await expect(page.getByLabel(copy.secretLabel, { exact: true })).toHaveCount(0)
    await accessible(page)
    expect(errors.length).toBe(0)
})

test('create validates and reveals once; explicit exports recover safely and destructive actions require confirmation', async ({
    page,
    context,
}) => {
    await mockAccount(context)
    await installServiceClientExportSink(page)
    const issued = { ...clients[0], id: randomUUID(), keyPrefix: `lef_${randomUUID().slice(0, 8)}` }
    let items = [clients[1]]
    let creates = 0
    let rotates = 0
    let disables = 0
    let deletes = 0
    await context.route(`**${collection}**`, async route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (request.method() === 'GET') return route.fulfill({ json: items })
        if (path.endsWith('/rotate')) {
            rotates++
            issued.keyPrefix = `lef_${randomUUID().slice(0, 8)}`
            items = items.map(item => (item.id === issued.id ? { ...issued } : item))
            return route.fulfill({
                json: { ...issued, apiKey: `lef_${randomBytes(32).toString('base64url')}` },
                headers: { 'cache-control': 'no-store' },
            })
        }
        if (path.endsWith('/disable')) {
            disables++
            items = items.map(item => (item.id === issued.id ? { ...item, status: 'disabled' } : item))
            return route.fulfill({ status: 204 })
        }
        if (request.method() === 'DELETE') {
            deletes++
            items = items.filter(item => item.id !== issued.id)
            return route.fulfill({ status: 204 })
        }
        creates++
        items = [issued, ...items]
        return route.fulfill({
            status: 201,
            json: { ...issued, apiKey: `lef_${randomBytes(32).toString('base64url')}` },
            headers: { 'cache-control': 'no-store' },
        })
    })
    await page.goto('/app/service-clients')
    await page.getByRole('button', { name: copy.create, exact: true }).click()
    await expect(page.getByText(copy.permissionsError, { exact: true })).toBeVisible()
    expect(creates).toBe(0)
    await create(page)
    const dialog = secretDialog(page)
    await expect(dialog).toBeVisible()
    await expect(page.getByLabel(copy.secretLabel, { exact: true })).toHaveAttribute('type', 'password')
    await accessible(page)
    await setExportFailures(page, true, true)
    await dialog.getByRole('button', { name: copy.copy, exact: true }).click()
    await expect(dialog.getByText(copy.copyFailed, { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: copy.download, exact: true }).click()
    await expect(dialog.getByText(copy.downloadFailed, { exact: true })).toBeVisible()
    await setExportFailures(page, false, false)
    await dialog.getByRole('button', { name: copy.copy, exact: true }).click()
    await dialog.getByRole('button', { name: copy.download, exact: true }).click()
    await expect.poll(async () => (await serviceClientExportEvidence(page)).downloaded).toBe(true)
    const evidence = await serviceClientExportEvidence(page)
    expect(evidence.copied && evidence.filenameSafe && evidence.revoked > 0).toBe(true)
    expect(
        await page.evaluate(
            () => localStorage.length === 0 && sessionStorage.length === 0 && !location.search && !location.hash,
        ),
    ).toBe(true)
    await dialog.getByRole('button', { name: copy.close, exact: true }).click()
    await expect(page.getByLabel(copy.secretLabel, { exact: true })).toHaveCount(0)
    const rotate = page.getByRole('button', { name: `Rotate API key ${issued.keyPrefix}`, exact: true })
    await rotate.click()
    const confirmation = page.getByRole('dialog', { name: copy.rotateTitle, exact: true })
    await expect(confirmation.getByRole('button', { name: copy.cancel, exact: true })).toBeFocused()
    await expect(confirmation).toContainText(copy.rotateConsequence)
    await page.keyboard.press('Shift+Tab')
    await expect(confirmation.getByRole('button', { name: copy.rotate, exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rotate).toBeFocused()
    expect(rotates).toBe(0)
    await rotate.click()
    await confirmation.getByRole('button', { name: copy.rotate, exact: true }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: copy.close, exact: true }).click()
    await page.getByRole('button', { name: `Disable API key ${issued.keyPrefix}`, exact: true }).click()
    const disable = page.getByRole('dialog', { name: copy.disableTitle, exact: true })
    await expect(disable).toContainText(copy.disableConsequence)
    expect(disables).toBe(0)
    await disable.getByRole('button', { name: copy.disable, exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: issued.keyPrefix })).toContainText('Disabled')
    await page.getByRole('button', { name: `Delete API key ${issued.keyPrefix}`, exact: true }).click()
    const deletion = page.getByRole('dialog', { name: copy.deleteTitle, exact: true })
    await expect(deletion).toContainText(issued.keyPrefix)
    expect(deletes).toBe(0)
    await deletion.getByRole('button', { name: copy.delete, exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: issued.keyPrefix })).toHaveCount(0)
    expect([creates, rotates, disables, deletes]).toEqual([1, 1, 1, 1])
    await accessible(page)
})

for (const status of [400, 403, 409, 503]) {
    test(`definite rejection ${status} has safe recovery without secret data`, async ({ page, context }) => {
        await mockAccount(context)
        let mutations = 0
        await context.route(`**${collection}`, route => {
            if (route.request().method() === 'GET') return route.fulfill({ json: [] })
            mutations++
            return route.fulfill({ status, json: {}, headers: { 'cache-control': 'no-store' } })
        })
        await page.goto('/app/service-clients')
        await create(page)
        await expect(
            page.getByText(
                status === 400
                    ? copy.invalid
                    : status === 403
                      ? copy.rejected
                      : status === 409
                        ? copy.conflict
                        : copy.unknown,
                { exact: true },
            ),
        ).toBeVisible()
        await expect(secretDialog(page)).toHaveCount(0)
        expect(mutations).toBe(1)
        await accessible(page)
    })
}

for (const operation of ['create', 'rotate'] as const) {
    test(`lost ${operation} response refreshes once without retry or a secret modal`, async ({ page, context }) => {
        await mockAccount(context)
        let reads = 0
        let writes = 0
        await context.route(`**${collection}**`, route => {
            if (route.request().method() === 'GET') {
                reads++
                return route.fulfill({ json: clients })
            }
            writes++
            return route.abort('connectionreset')
        })
        await page.goto('/app/service-clients')
        await expect(page.getByText(clients[0].keyPrefix, { exact: true })).toBeVisible()
        const before = reads
        if (operation === 'create') await create(page)
        else {
            await page.getByRole('button', { name: `Rotate API key ${clients[0].keyPrefix}`, exact: true }).click()
            await page
                .getByRole('dialog', { name: copy.rotateTitle })
                .getByRole('button', { name: copy.rotate, exact: true })
                .click()
        }
        await expect(page.getByText(copy.unknown, { exact: true })).toBeVisible()
        await expect.poll(() => reads).toBeGreaterThan(before)
        await expect(secretDialog(page)).toHaveCount(0)
        expect(writes).toBe(1)
        await accessible(page)
    })
}

for (const operation of ['create', 'rotate'] as const) {
    test(`late ${operation} settlement after pagehide and cached pageshow cannot reopen a secret`, async ({
        page,
        context,
    }) => {
        await mockAccount(context)
        let release!: () => void
        let finish!: () => void
        const pending = new Promise<void>(resolve => {
            release = resolve
        })
        const settled = new Promise<void>(resolve => {
            finish = resolve
        })
        let writes = 0
        await context.route(`**${collection}**`, async route => {
            if (route.request().method() === 'GET') return route.fulfill({ json: clients })
            writes++
            await pending
            await route
                .fulfill({
                    status: operation === 'create' ? 201 : 200,
                    json: { ...clients[0], apiKey: `lef_${randomBytes(32).toString('base64url')}` },
                })
                .catch(() => undefined)
            finish()
        })
        await page.goto('/app/service-clients')
        if (operation === 'create') await create(page)
        else {
            await page.getByRole('button', { name: `Rotate API key ${clients[0].keyPrefix}`, exact: true }).click()
            await page
                .getByRole('dialog', { name: copy.rotateTitle })
                .getByRole('button', { name: copy.rotate, exact: true })
                .click()
        }
        await expect.poll(() => writes).toBe(1)
        await page.evaluate(() => {
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
            window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
        })
        release()
        await settled
        await expect(page.getByRole('button', { name: copy.create, exact: true })).toBeVisible()
        await expect(secretDialog(page)).toHaveCount(0)
        await expect(page.getByLabel(copy.secretLabel, { exact: true })).toHaveCount(0)
        expect(writes).toBe(1)
    })
}

test('full-page Back and Forward and forced reload clear issued secrets before restoration', async ({
    page,
    context,
}) => {
    await mockAccount(context)
    await context.addInitScript(() =>
        window.addEventListener('pageshow', event => {
            document.documentElement.dataset.restoredFromCache = String(event.persisted)
        }),
    )
    let creates = 0
    await context.route(`**${collection}`, route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: clients })
        creates++
        return route.fulfill({
            status: 201,
            json: { ...clients[0], apiKey: `lef_${randomBytes(32).toString('base64url')}` },
        })
    })
    await page.goto('/app/service-clients')
    await create(page)
    await expect(secretDialog(page)).toBeVisible()
    await page.goto('/')
    await page.evaluate(() => window.history.back())
    await expect(page.getByRole('heading', { name: copy.title, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.restoredFromCache === 'true')).toBe(true)
    await expect(secretDialog(page)).toHaveCount(0)
    await page.evaluate(() => window.history.forward())
    await expect(page.getByRole('heading', { name: 'Verify the signal before you send.' })).toBeVisible()
    await page.evaluate(() => window.history.back())
    await expect(secretDialog(page)).toHaveCount(0)
    await page.reload()
    await expect(page.getByLabel(copy.secretLabel, { exact: true })).toHaveCount(0)
    expect(creates).toBe(1)
})

test('capability denial, empty state and read recovery remain usable without exposing credentials', async ({
    page,
    context,
}) => {
    await mockAccount(context, false)
    await page.goto('/app/service-clients')
    await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
    await mockAccount(context)
    let unavailable = true
    await context.route(`**${collection}`, route =>
        route.fulfill({ status: unavailable ? 503 : 200, json: unavailable ? {} : [] }),
    )
    await page.goto('/app/service-clients')
    const retry = page.getByRole('button', { name: 'Try again', exact: true })
    await expect(retry).toBeVisible()
    unavailable = false
    await retry.click()
    await expect(page.getByText(copy.empty, { exact: true })).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await accessible(page)
})
