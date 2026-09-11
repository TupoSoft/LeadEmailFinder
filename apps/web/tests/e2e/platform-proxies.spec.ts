import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '../support/privileged-login'
import { browserFixtureEnvironment } from '../support/browser-fixture-environment'

/** This suite uses the existing disposable-stack operator fixture and owns exactly one proxy. */
test('MFA platform operator creates a disabled fixture, edits it, manages lifecycle and blacklists, and deletes it', async ({
    loginAs,
}) => {
    const { origin } = await browserFixtureEnvironment()
    const operator = await loginAs('platformOperator')
    const description = `Browser proxy ${randomUUID()}`
    const host = `proxy-${randomUUID()}.invalid`
    let createdId: string | undefined
    let creation: Promise<{ status: number; noStore: boolean; redacted: boolean }> | undefined
    let creates = 0
    let runtimeErrors = 0
    operator.on('pageerror', () => runtimeErrors++)
    operator.on('request', request => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/v1/proxies') creates++
    })

    async function ownedRow() {
        await expect(operator.getByRole('region', { name: 'Proxy registry', exact: true })).toHaveAttribute(
            'aria-busy',
            'false',
        )
        const row = operator.getByRole('row').filter({ hasText: description })
        for (;;) {
            if (await row.count()) {
                await expect(row).toContainText(host)
                await expect(row).toContainText(createdId!)
                return row
            }
            const more = operator.getByRole('button', { name: 'Load more', exact: true })
            if (!(await more.count())) return row
            await more.click()
            await expect(operator.getByRole('region', { name: 'Proxy registry', exact: true })).toHaveAttribute(
                'aria-busy',
                'false',
            )
        }
    }

    try {
        await operator.goto(`${origin}/app/platform/proxies`)
        await expect(operator).toHaveTitle('Proxy fleet | Lead Email Finder')
        await expect(operator.getByRole('heading', { name: 'Proxy fleet', exact: true })).toBeVisible()
        await operator.getByRole('button', { name: 'Create proxy', exact: true }).click()
        const dialog = operator.getByRole('dialog', { name: 'Create proxy', exact: true })
        await expect(dialog).toContainText(/disabled/i)
        await expect(operator.getByLabel('Proxy username', { exact: true })).toHaveCount(0)
        await dialog.getByLabel('Host', { exact: true }).fill(host)
        await dialog.getByLabel('Port', { exact: true }).fill('1080')
        await dialog.getByLabel('Description', { exact: true }).fill(description)
        await dialog.getByRole('checkbox', { name: 'Use authentication', exact: true }).check()
        await dialog.getByLabel('Proxy username', { exact: true }).fill(randomUUID())
        await dialog.getByLabel('Proxy password', { exact: true }).fill(randomUUID())
        creation = operator
            .waitForResponse(
                response =>
                    response.request().method() === 'POST' && new URL(response.url()).pathname === '/v1/proxies',
            )
            .then(async response => {
                const metadata = (await response.json()) as {
                    id?: unknown
                    auth?: unknown
                    user?: unknown
                    pass?: unknown
                }
                if (typeof metadata.id === 'string') createdId = metadata.id
                return {
                    status: response.status(),
                    noStore: response.headers()['cache-control'] === 'no-store',
                    redacted: !['auth', 'user', 'pass'].some(key => Object.hasOwn(metadata, key)),
                }
            })
        void creation.catch(() => undefined)
        await dialog.getByRole('button', { name: 'Create proxy', exact: true }).click()
        expect(await creation).toEqual({ status: 201, noStore: true, redacted: true })
        expect(Boolean(createdId)).toBe(true)
        await expect(operator.getByRole('dialog')).toHaveCount(0)
        const row = await ownedRow()
        await expect(row).toContainText('Disabled')
        await expect(operator.getByLabel('Proxy password', { exact: true })).toHaveCount(0)

        await row.getByRole('button', { name: 'Edit proxy', exact: true }).click()
        await expect(operator.getByLabel('Proxy username', { exact: true })).toHaveCount(0)
        await operator.getByLabel('Weight', { exact: true }).fill('2')
        const update = operator.waitForResponse(
            response =>
                response.request().method() === 'PATCH' &&
                new URL(response.url()).pathname === `/v1/proxies/${createdId}`,
        )
        await operator.getByRole('button', { name: 'Save changes', exact: true }).click()
        const updated = await update
        expect(updated.status()).toBe(200)
        expect(updated.headers()['cache-control'] === 'no-store').toBe(true)
        expect(!Object.hasOwn(updated.request().postDataJSON() as object, 'auth')).toBe(true)
        await expect(operator.getByRole('dialog')).toHaveCount(0)

        for (const [action, state] of [
            ['Activate', 'Active'],
            ['Drain', 'Draining'],
            ['Disable', 'Disabled'],
        ]) {
            await row.getByRole('button', { name: action, exact: true }).click()
            const confirmation = operator.getByRole('dialog', { name: `${action} proxy`, exact: true })
            await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
            await confirmation.getByRole('button', { name: action, exact: true }).click()
            await expect(row).toContainText(state)
        }
        for (let index = 0; index < 2; index++) {
            await row.getByRole('button', { name: 'Report MX blacklist', exact: true }).click()
            const blacklist = operator.getByRole('dialog', { name: 'Report MX blacklist', exact: true })
            await blacklist.getByLabel('MX host', { exact: true }).fill('mx.browser-fixture.invalid')
            await blacklist.getByRole('button', { name: 'Report blacklist', exact: true }).click()
            await expect(blacklist).toHaveCount(0)
            await expect(row.getByText('mx.browser-fixture.invalid', { exact: true })).toHaveCount(1)
        }
        const audit = await new AxeBuilder({ page: operator })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        expect(audit.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? '')).length).toBe(0)
        await row.getByRole('button', { name: 'Delete proxy', exact: true }).click()
        const deletion = operator.getByRole('dialog', { name: 'Delete proxy', exact: true })
        await expect(deletion).toContainText(`${host}:1080`)
        await deletion.getByRole('button', { name: 'Delete proxy', exact: true }).click()
        await expect(row).toHaveCount(0)
        createdId = undefined
        await operator.reload()
        await expect(operator.getByLabel('Proxy password', { exact: true })).toHaveCount(0)
        expect(creates).toBe(1)
        expect(runtimeErrors).toBe(0)
    } finally {
        await creation?.catch(() => undefined)
        if (createdId) {
            // Read a fresh document and verify the captured ID, unique description, and hostname before deleting.
            await operator.goto(`${origin}/`)
            await operator.goto(`${origin}/app/platform/proxies`)
            await expect(operator.getByRole('heading', { name: 'Proxy fleet', exact: true })).toBeVisible()
            const row = await ownedRow()
            await expect(row).toBeVisible()
            await row.getByRole('button', { name: 'Delete proxy', exact: true }).click()
            await operator
                .getByRole('dialog', { name: 'Delete proxy', exact: true })
                .getByRole('button', { name: 'Delete proxy', exact: true })
                .click()
            await expect(row).toHaveCount(0)
        }
    }
})

test('customer owner cannot discover the proxy console or read its protected API', async ({ loginAs }) => {
    const { origin } = await browserFixtureEnvironment()
    const owner = await loginAs('owner')
    await expect(owner.getByRole('link', { name: 'Proxy fleet', exact: true })).toHaveCount(0)
    await owner.goto(`${origin}/app/platform/proxies`)
    await expect(owner.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
    await expect(owner.getByRole('button', { name: 'Create proxy', exact: true })).toHaveCount(0)
    const denied = await owner.evaluate(async () => {
        const response = await fetch('/v1/proxies?pageSize=1')
        const body = (await response.json()) as Record<string, unknown>
        return { status: response.status, containsRegistry: Object.hasOwn(body, 'proxies') }
    })
    expect(denied).toEqual({ status: 403, containsRegistry: false })
})
