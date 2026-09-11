import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from '../support/privileged-login'

const collection = '/v1/proxies'
const routePath = '/app/platform/proxies'
const proxy = (description = 'Disposable SMTP fixture', id = randomUUID()) => ({
    id,
    protocol: 3,
    host: 'proxy.example.test',
    port: 1080,
    state: 'disabled',
    weight: 1,
    maxConcurrent: 1,
    requestsPerMinute: 10,
    description,
    blacklists: [] as string[],
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
})

async function account(context: BrowserContext, capabilities = ['platform.proxies.manage']) {
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
    await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined)))
    })
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? '')).length).toBe(0)
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true)
    await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

async function openCreate(page: Page) {
    await page.getByRole('button', { name: 'Create proxy', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Create proxy', exact: true })
    await dialog.getByLabel('Host', { exact: true }).fill('new-proxy.example.test')
    await dialog.getByLabel('Port', { exact: true }).fill('1080')
    await dialog.getByLabel('Description', { exact: true }).fill('Browser disposable proxy')
    return dialog
}

async function enterAuthentication(page: Page, replacement = false) {
    await page
        .getByRole('checkbox', { name: replacement ? 'Replace authentication' : 'Use authentication', exact: true })
        .check()
    await page.getByLabel('Proxy username', { exact: true }).fill(randomUUID())
    await page.getByLabel('Proxy password', { exact: true }).fill(randomUUID())
}

async function authenticationAbsent(page: Page) {
    await expect(page.getByLabel('Proxy username', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Proxy password', { exact: true })).toHaveCount(0)
}

const rowFor = (page: Page, description: string) => page.getByRole('row').filter({ hasText: description })

for (const mode of ['create', 'edit'] as const) {
    test(`${mode} fields stay aligned with absent or wrapped help text`, async ({ page, context }) => {
        await account(context)
        const item = proxy()
        await context.route(`**${collection}**`, route =>
            route.fulfill({
                json:
                    new URL(route.request().url()).pathname === collection
                        ? { proxies: [item], nextPageToken: '' }
                        : item,
            }),
        )
        let runtimeErrors = 0
        page.on('pageerror', () => runtimeErrors++)
        page.on('console', message => {
            if (message.type() === 'error') runtimeErrors++
        })
        await page.goto(routePath)
        await expect(page).toHaveTitle('Proxy fleet | Lead Email Finder')
        await page.getByRole('button', { name: mode === 'create' ? 'Create proxy' : 'Edit proxy', exact: true }).click()
        const dialog = page.getByRole('dialog', {
            name: mode === 'create' ? 'Create proxy' : 'Edit proxy',
            exact: true,
        })
        await expect(dialog.getByLabel('Host', { exact: true })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const controls = await dialog.locator('select, input:not([type="checkbox"])').evaluateAll(elements =>
            elements.map(element => {
                const { top, left, height } = element.getBoundingClientRect()
                return { top, left, height }
            }),
        )
        expect(controls).toHaveLength(7)
        // Native selects can differ slightly from text inputs even without grid stretching.
        for (const control of controls) expect(Math.abs(control.height - controls[1].height)).toBeLessThanOrEqual(2)
        if (page.viewportSize()!.width > 768) {
            for (const index of [0, 2, 4]) {
                expect(Math.abs(controls[index].top - controls[index + 1].top)).toBeLessThanOrEqual(1)
            }
        } else {
            for (const [index, control] of controls.entries()) {
                expect(Math.abs(control.left - controls[0].left)).toBeLessThanOrEqual(1)
                if (index > 0) expect(control.top).toBeGreaterThan(controls[index - 1].top)
            }
        }
        await accessible(page)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        expect(runtimeErrors).toBe(0)
    })
}

test('registry follows returned cursors, deduplicates rows, and shows no invented total at either width', async ({
    page,
    context,
}) => {
    await account(context)
    const first = proxy()
    const second = proxy('A long proxy description that remains readable on a narrow screen')
    const cursor = randomUUID()
    const cursors: (string | null)[] = []
    let runtimeErrors = 0
    page.on('pageerror', () => runtimeErrors++)
    page.on('console', message => {
        if (message.type() === 'error') runtimeErrors++
    })
    await context.route(`**${collection}**`, route => {
        const pageToken = new URL(route.request().url()).searchParams.get('pageToken')
        cursors.push(pageToken)
        return route.fulfill({
            json: pageToken
                ? { proxies: [first, second], nextPageToken: '' }
                : { proxies: [first], nextPageToken: cursor },
        })
    })
    await page.goto(routePath)
    await expect(page).toHaveTitle('Proxy fleet | Lead Email Finder')
    await expect(page.getByRole('heading', { name: 'Proxy fleet', exact: true })).toBeVisible()
    await expect(rowFor(page, first.description)).toContainText('Disabled')
    await authenticationAbsent(page)
    await page.getByRole('button', { name: 'Load more', exact: true }).click()
    await expect(rowFor(page, second.description)).toBeVisible()
    await expect(rowFor(page, first.description)).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0)
    const terminalSpacing = await page
        .getByText('You have reached the end of this list.', { exact: true })
        .evaluate(element => {
            const finalRow = element.parentElement!.querySelector('tbody tr:last-child')!
            const text = document.createRange()
            text.selectNodeContents(element)
            const probe = document.createElement('div')
            probe.style.position = 'fixed'
            probe.style.height = 'var(--space-content-gap)'
            document.body.append(probe)
            const minimumGap = probe.getBoundingClientRect().height
            probe.remove()
            return { gap: text.getBoundingClientRect().top - finalRow.getBoundingClientRect().bottom, minimumGap }
        })
    expect(terminalSpacing.minimumGap).toBeGreaterThan(0)
    expect(terminalSpacing.gap).toBeGreaterThanOrEqual(terminalSpacing.minimumGap)
    expect(cursors).toEqual([null, cursor])
    expect(await page.getByText(/\bpage \d|\d+ (?:total proxies|proxies total)|showing \d+ of \d+/i).count()).toBe(0)
    await accessible(page)
    expect(runtimeErrors).toBe(0)
})

test('create stays disabled, requires complete opted-in authentication, and clears it on settlement', async ({
    page,
    context,
}) => {
    await account(context)
    const created = proxy('Browser disposable proxy')
    let items: ReturnType<typeof proxy>[] = []
    let writes = 0
    let safeBody = false
    await context.route(`**${collection}**`, route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { proxies: items, nextPageToken: '' } })
        writes++
        const body = route.request().postDataJSON() as { state?: string; auth?: { user?: string; pass?: string } }
        safeBody = body.state === 'disabled' && Boolean(body.auth?.user && body.auth.pass)
        items = [created]
        return route.fulfill({ status: 201, json: created, headers: { 'cache-control': 'no-store' } })
    })
    await page.goto(routePath)
    const dialog = await openCreate(page)
    await expect(dialog).toContainText(/disabled/i)
    await authenticationAbsent(page)
    await expect(dialog.locator('form')).toHaveAttribute('autocomplete', 'off')
    await dialog.getByRole('checkbox', { name: 'Use authentication', exact: true }).check()
    await expect(page.getByLabel('Proxy username', { exact: true })).toHaveAttribute('autocomplete', 'off')
    await expect(page.getByLabel('Proxy password', { exact: true })).toHaveAttribute('autocomplete', 'new-password')
    await expect(page.getByLabel('Proxy password', { exact: true })).toHaveAttribute('type', 'password')
    await dialog.getByLabel('Proxy username', { exact: true }).fill(randomUUID())
    await dialog.getByRole('button', { name: 'Create proxy', exact: true }).click()
    expect(writes).toBe(0)
    await dialog.getByLabel('Proxy password', { exact: true }).fill(randomUUID())
    await accessible(page)
    await dialog.getByRole('button', { name: 'Create proxy', exact: true }).click()
    await expect(rowFor(page, created.description)).toContainText('Disabled')
    await expect(page.getByText('The change was confirmed. Refreshing the registry…', { exact: true })).toHaveCount(0)
    await authenticationAbsent(page)
    expect(writes === 1 && safeBody).toBe(true)
    expect(
        await page.evaluate(
            () => localStorage.length === 0 && sessionStorage.length === 0 && !location.search && !location.hash,
        ),
    ).toBe(true)
})

test('ordinary editing omits authentication and explicit replacement requires confirmation before writing', async ({
    page,
    context,
}) => {
    await account(context)
    let item = proxy()
    let writes = 0
    const authIncluded: boolean[] = []
    await context.route(`**${collection}**`, route => {
        const request = route.request()
        if (request.method() === 'GET')
            return route.fulfill({
                json: new URL(request.url()).pathname === collection ? { proxies: [item], nextPageToken: '' } : item,
            })
        writes++
        const body = request.postDataJSON() as { description?: string; auth?: { user?: string; pass?: string } }
        authIncluded.push(Object.hasOwn(body, 'auth'))
        item = { ...item, description: body.description ?? item.description }
        return route.fulfill({ json: item, headers: { 'cache-control': 'no-store' } })
    })
    await page.goto(routePath)
    await rowFor(page, item.description).getByRole('button', { name: 'Edit proxy', exact: true }).click()
    await authenticationAbsent(page)
    await page.getByLabel('Description', { exact: true }).fill('Updated fixture')
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(rowFor(page, 'Updated fixture')).toBeVisible()
    expect(authIncluded).toEqual([false])
    await rowFor(page, 'Updated fixture').getByRole('button', { name: 'Edit proxy', exact: true }).click()
    await enterAuthentication(page, true)
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Replace authentication', exact: true })).toBeVisible()
    expect(writes).toBe(1)
    await page.getByRole('button', { name: 'Cancel replacement', exact: true }).click()
    expect(writes).toBe(1)
    await enterAuthentication(page, true)
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.getByRole('button', { name: 'Replace authentication', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await authenticationAbsent(page)
    expect(authIncluded).toEqual([false, true])
})

test('lifecycle and deletion wait for confirmation and blacklist reporting renders the deduplicated server state', async ({
    page,
    context,
}) => {
    await account(context)
    let item = proxy()
    let deleted = false
    const transitions: string[] = []
    let reports = 0
    let deletes = 0
    await context.route(`**${collection}**`, route => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (request.method() === 'GET')
            return route.fulfill({
                json: path === collection ? { proxies: deleted ? [] : [item], nextPageToken: '' } : item,
            })
        if (request.method() === 'DELETE') {
            deletes++
            deleted = true
            return route.fulfill({ status: 204 })
        }
        if (path.endsWith('/blacklists')) {
            reports++
            item = { ...item, blacklists: ['mx.example.test'] }
            return route.fulfill({ status: 204 })
        }
        const body = request.postDataJSON() as { state: string }
        transitions.push(body.state)
        item = { ...item, state: body.state }
        return route.fulfill({ json: item })
    })
    await page.goto(routePath)
    const row = rowFor(page, item.description)
    for (const [action, state] of [
        ['Activate', 'active'],
        ['Drain', 'draining'],
        ['Disable', 'disabled'],
    ]) {
        const before = transitions.length
        const trigger = row.getByRole('button', { name: action, exact: true })
        await trigger.click()
        const confirmation = page.getByRole('dialog', { name: `${action} proxy`, exact: true })
        await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
        expect(transitions.length).toBe(before)
        await accessible(page)
        await page.keyboard.press('Escape')
        await expect(trigger).toBeFocused()
        await trigger.click()
        await confirmation.getByRole('button', { name: action, exact: true }).click()
        await expect(row).toContainText(state[0].toUpperCase() + state.slice(1))
    }
    for (let report = 0; report < 2; report++) {
        await row.getByRole('button', { name: 'Report MX blacklist', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Report MX blacklist', exact: true })
        await dialog.getByLabel('MX host', { exact: true }).fill('mx.example.test')
        await dialog.getByRole('button', { name: 'Report blacklist', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        await expect(row.getByText('mx.example.test', { exact: true })).toHaveCount(1)
    }
    expect(await row.getByRole('button', { name: /remove.*blacklist/i }).count()).toBe(0)
    await row.getByRole('button', { name: 'Delete proxy', exact: true }).click()
    const deletion = page.getByRole('dialog', { name: 'Delete proxy', exact: true })
    await expect(deletion).toContainText('proxy.example.test:1080')
    expect(deletes).toBe(0)
    await deletion.getByRole('button', { name: 'Delete proxy', exact: true }).click()
    await expect(row).toHaveCount(0)
    await expect(page.getByText('The change was confirmed. Refreshing the registry…', { exact: true })).toHaveCount(0)
    expect(transitions).toEqual(['active', 'draining', 'disabled'])
    expect(reports === 2 && deletes === 1).toBe(true)
})

for (const operation of ['create', 'replace'] as const) {
    test(`lost ${operation} response reconciles without retrying or retaining credentials`, async ({
        page,
        context,
    }) => {
        await account(context)
        const item = proxy()
        let reads = 0
        let writes = 0
        await context.route(`**${collection}**`, route => {
            if (route.request().method() === 'GET') {
                reads++
                return route.fulfill({
                    json:
                        new URL(route.request().url()).pathname === collection
                            ? { proxies: [item], nextPageToken: '' }
                            : item,
                })
            }
            writes++
            return route.abort('connectionreset')
        })
        await page.goto(routePath)
        await expect(rowFor(page, item.description)).toBeVisible()
        if (operation === 'create') await openCreate(page)
        else await rowFor(page, item.description).getByRole('button', { name: 'Edit proxy', exact: true }).click()
        await enterAuthentication(page, operation === 'replace')
        const before = reads
        await page
            .getByRole('dialog')
            .getByRole('button', { name: operation === 'create' ? 'Create proxy' : 'Save changes', exact: true })
            .click()
        if (operation === 'replace')
            await page.getByRole('button', { name: 'Replace authentication', exact: true }).click()
        await expect.poll(() => reads).toBeGreaterThan(before)
        await authenticationAbsent(page)
        await expect(
            page
                .getByText(
                    /could not confirm|cannot confirm|could not be confirmed|outcome.*unknown|outcome.*uncertain|outcome.*unconfirmed/i,
                )
                .first(),
        ).toBeVisible()
        expect(writes).toBe(1)
    })

    test(`late ${operation} settlement after pagehide and cached pageshow cannot restore credential entry`, async ({
        page,
        context,
    }) => {
        await account(context)
        const item = proxy()
        let writes = 0
        let release!: () => void
        const pending = new Promise<void>(resolve => {
            release = resolve
        })
        let finish!: () => void
        const settled = new Promise<void>(resolve => {
            finish = resolve
        })
        await context.route(`**${collection}**`, async route => {
            if (route.request().method() === 'GET')
                return route.fulfill({
                    json:
                        new URL(route.request().url()).pathname === collection
                            ? { proxies: [item], nextPageToken: '' }
                            : item,
                })
            writes++
            await pending
            await route.fulfill({ status: operation === 'create' ? 201 : 200, json: item }).catch(() => undefined)
            finish()
        })
        await page.goto(routePath)
        if (operation === 'create') await openCreate(page)
        else await rowFor(page, item.description).getByRole('button', { name: 'Edit proxy', exact: true }).click()
        await enterAuthentication(page, operation === 'replace')
        await page
            .getByRole('dialog')
            .getByRole('button', { name: operation === 'create' ? 'Create proxy' : 'Save changes', exact: true })
            .click()
        if (operation === 'replace')
            await page.getByRole('button', { name: 'Replace authentication', exact: true }).click()
        await expect.poll(() => writes).toBe(1)
        await page.evaluate(() => {
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
            window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
        })
        await authenticationAbsent(page)
        release()
        await settled
        await authenticationAbsent(page)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        expect(writes).toBe(1)
    })
}

test('full-page Back, Forward, and reload cannot restore or submit entered authentication', async ({
    page,
    context,
}) => {
    await account(context)
    await context.addInitScript(() =>
        window.addEventListener('pageshow', event => {
            document.documentElement.dataset.restoredFromCache = String(event.persisted)
        }),
    )
    let writes = 0
    await context.route(`**${collection}**`, route => {
        if (route.request().method() !== 'GET') writes++
        return route.fulfill({ json: { proxies: [], nextPageToken: '' } })
    })
    await page.goto(routePath)
    await openCreate(page)
    await enterAuthentication(page)
    await page.goto('/')
    await page.evaluate(() => window.history.back())
    await expect(page.getByRole('heading', { name: 'Proxy fleet', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.restoredFromCache === 'true')).toBe(true)
    await authenticationAbsent(page)
    await page.evaluate(() => window.history.forward())
    await expect(page.getByRole('heading', { name: 'Verify the signal before you send.' })).toBeVisible()
    await page.evaluate(() => window.history.back())
    await authenticationAbsent(page)
    await page.reload()
    await authenticationAbsent(page)
    expect(writes).toBe(0)
})

test('permission denial, empty registry, and failed reads recover without exposing authentication', async ({
    page,
    context,
}) => {
    await account(context, [])
    let reads = 0
    let unavailable = true
    await context.route(`**${collection}**`, route => {
        reads++
        return route.fulfill({
            status: unavailable ? 503 : 200,
            json: unavailable ? {} : { proxies: [], nextPageToken: '' },
        })
    })
    await page.goto(routePath)
    await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Proxy fleet', exact: true })).toHaveCount(0)
    expect(reads).toBe(0)
    await account(context)
    await page.goto(routePath)
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    unavailable = false
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByText(/no proxies/i).first()).toBeVisible()
    await authenticationAbsent(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await accessible(page)
})

for (const [status, message] of [
    [400, /request was rejected/i],
    [403, /registry was denied/i],
    [404, /proxy no longer exists/i],
    [409, /conflicts with the current registry/i],
    [503, /outcome is unconfirmed/i],
] as const) {
    test(`credential-bearing rejection ${status} clears the form and reports safe recovery`, async ({
        page,
        context,
    }) => {
        await account(context)
        let writes = 0
        await context.route(`**${collection}**`, route => {
            if (route.request().method() === 'GET') return route.fulfill({ json: { proxies: [], nextPageToken: '' } })
            writes++
            return route.fulfill({ status, json: {}, headers: { 'cache-control': 'no-store' } })
        })
        await page.goto(routePath)
        const dialog = await openCreate(page)
        await enterAuthentication(page)
        await dialog.getByRole('button', { name: 'Create proxy', exact: true }).click()
        if (status === 403)
            await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
        else await expect(page.getByText(message).first()).toBeVisible()
        await authenticationAbsent(page)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        expect(writes).toBe(1)
    })
}

test('a rejected continuation preserves rows and requires a fresh registry read', async ({ page, context }) => {
    await account(context)
    const item = proxy()
    let refreshed = false
    await context.route(`**${collection}**`, route => {
        const cursor = new URL(route.request().url()).searchParams.get('pageToken')
        return route.fulfill({
            status: cursor ? 400 : 200,
            json: cursor ? {} : { proxies: [item], nextPageToken: refreshed ? '' : randomUUID() },
        })
    })
    await page.goto(routePath)
    await page.getByRole('button', { name: 'Load more', exact: true }).click()
    await expect(page.getByText(/continuation is no longer valid/i)).toBeVisible()
    await expect(rowFor(page, item.description)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toBeDisabled()
    refreshed = true
    await page.getByRole('button', { name: 'Refresh proxies', exact: true }).click()
    await expect(page.getByText(/continuation is no longer valid/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0)
    await expect(rowFor(page, item.description)).toHaveCount(1)
})

for (const operation of ['create', 'replace'] as const) {
    test(`cancelling an in-flight ${operation} ignores its delayed failure and requires reconciliation`, async ({
        page,
        context,
    }) => {
        await account(context)
        const item = proxy()
        let writes = 0
        let release!: () => void
        const pending = new Promise<void>(resolve => {
            release = resolve
        })
        let finish!: () => void
        const settled = new Promise<void>(resolve => {
            finish = resolve
        })
        await context.route(`**${collection}**`, async route => {
            if (route.request().method() === 'GET')
                return route.fulfill({
                    json:
                        new URL(route.request().url()).pathname === collection
                            ? { proxies: [item], nextPageToken: '' }
                            : item,
                })
            writes++
            await pending
            await route.fulfill({ status: 503, json: {} }).catch(() => undefined)
            finish()
        })
        await page.goto(routePath)
        if (operation === 'create') await openCreate(page)
        else await rowFor(page, item.description).getByRole('button', { name: 'Edit proxy', exact: true }).click()
        await enterAuthentication(page, operation === 'replace')
        await page
            .getByRole('dialog')
            .getByRole('button', { name: operation === 'create' ? 'Create proxy' : 'Save changes', exact: true })
            .click()
        if (operation === 'replace')
            await page.getByRole('button', { name: 'Replace authentication', exact: true }).click()
        await expect.poll(() => writes).toBe(1)
        await page.getByRole('button', { name: 'Cancel waiting', exact: true }).click()
        release()
        await settled
        await authenticationAbsent(page)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Create proxy', exact: true })).toBeDisabled()
        await page.getByRole('button', { name: 'I have reconciled the unconfirmed change', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Create proxy', exact: true })).toBeEnabled()
        expect(writes).toBe(1)
    })
}

test('a deleted endpoint blocks editing without exposing stale controls', async ({ page, context }) => {
    await account(context)
    const item = proxy()
    await context.route(`**${collection}**`, route => {
        const list = new URL(route.request().url()).pathname === collection
        return route.fulfill({ status: list ? 200 : 404, json: list ? { proxies: [item], nextPageToken: '' } : {} })
    })
    await page.goto(routePath)
    await rowFor(page, item.description).getByRole('button', { name: 'Edit proxy', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit proxy', exact: true })
    await expect(dialog.getByText(/proxy no longer exists/i)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await expect(dialog.getByLabel('Host', { exact: true })).toHaveCount(0)
    await authenticationAbsent(page)
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toHaveCount(0)
})

test('route unmount ignores delayed credential failure and preserves the need to reconcile on return', async ({
    page,
    context,
}) => {
    await account(context)
    let writes = 0
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    let finish!: () => void
    const settled = new Promise<void>(resolve => {
        finish = resolve
    })
    await context.route(`**${collection}**`, async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { proxies: [], nextPageToken: '' } })
        writes++
        await pending
        await route.fulfill({ status: 503, json: {} }).catch(() => undefined)
        finish()
    })
    await page.goto('/app')
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
    if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await page.getByRole('link', { name: 'Proxy fleet', exact: true }).click()
    const dialog = await openCreate(page)
    await enterAuthentication(page)
    await dialog.getByRole('button', { name: 'Create proxy', exact: true }).click()
    await expect.poll(() => writes).toBe(1)
    await page.goBack()
    release()
    await settled
    await expect(page).toHaveURL(/\/app$/)
    await authenticationAbsent(page)
    if (await page.getByRole('button', { name: 'Open navigation', exact: true }).isVisible())
        await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await page.getByRole('link', { name: 'Proxy fleet', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Proxy fleet', exact: true })).toBeVisible()
    await authenticationAbsent(page)
    await expect(page.getByRole('button', { name: 'Create proxy', exact: true })).toBeDisabled()
    await expect(page.getByText(/outcome is unconfirmed/i)).toBeVisible()
    expect(writes).toBe(1)
})
