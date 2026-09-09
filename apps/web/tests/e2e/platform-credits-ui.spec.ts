import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from '../support/privileged-login'
import {
    addCredits,
    expectCreditBalance,
    expectCreditsAccessible,
    reviewAbsoluteBalance,
    reviewCreditAddition,
} from '../support/platform-credits'

const membershipId = 'aa838afc-d2eb-43b7-b1a6-8629a98e1dc9'
const recoveryPrefix = 'lef-platform-credit-adjustment:'
const organization = {
    id: 'f7c96245-6217-4e84-a7d8-a45b1fbd925a',
    name: 'Northstar research and international operations',
    createdAt: '2026-09-09T12:00:00.000Z',
    updatedAt: '2026-09-09T12:00:00.000Z',
}
const path = `/app/platform/organizations/${organization.id}/credits`
const creditPath = `/credits/${organization.id}`

async function account(
    context: BrowserContext,
    capabilities = ['platform.organizations.manage', 'platform.credits.manage'],
    principal = membershipId,
) {
    await context.route('**/v1/auth/session', route =>
        route.fulfill({
            json: {
                email: 'operator@example.test',
                membership: { id: principal, role: 'platform_admin' },
                organization: { id: 'platform', name: 'Platform workspace' },
                capabilities,
                grantableServiceClientPermissions: [],
            },
        }),
    )
    await context.route('**/v1/organizations?*', route => route.fulfill({ json: { organizations: [organization] } }))
    await context.route(`**/v1/organizations/${organization.id}`, route => route.fulfill({ json: organization }))
}

async function savedAdjustments(page: Page) {
    return page.evaluate(
        prefix => Object.keys(sessionStorage).filter(key => key.startsWith(prefix)).length,
        recoveryPrefix,
    )
}

test('directory entry, validation, keyboard confirmation, pending balance and authoritative add/set are accessible', async ({
    page,
    context,
}, info) => {
    await account(context)
    let balance = 100
    let additions = 0
    let sets = 0
    let storedBeforePost = false
    let key = ''
    let release!: () => void
    const pending = new Promise<void>(resolve => {
        release = resolve
    })
    const errors: number[] = []
    page.on('pageerror', () => errors.push(1))
    page.on('console', message => {
        if (message.type() === 'error') errors.push(1)
    })
    await context.route(`**${creditPath}`, async route => {
        const request = route.request()
        if (request.method() === 'POST') {
            additions++
            key = request.headers()['idempotency-key'] ?? ''
            storedBeforePost = await page.evaluate(
                ({ prefix, expectedKey }) =>
                    Object.keys(sessionStorage).some(
                        name =>
                            name.startsWith(prefix) &&
                            (JSON.parse(sessionStorage.getItem(name) ?? 'null') as { key?: string } | null)?.key ===
                                expectedKey,
                    ),
                { prefix: recoveryPrefix, expectedKey: key },
            )
            expect(request.postDataJSON()).toEqual({ amount: 25 })
            await pending
            balance = 131
            return route.fulfill({ status: 201, json: { balance: 125 } })
        }
        if (request.method() === 'PUT') {
            sets++
            expect(request.postDataJSON()).toEqual({ amount: 0 })
            balance = 0
        }
        return route.fulfill({ json: { balance } })
    })
    await page.goto('/app/platform/organizations')
    const entry = page.getByRole('link', { name: `Manage credits for ${organization.name}`, exact: true })
    await entry.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page).toHaveTitle('Organization credits | Lead Email Finder')
    await expect(page.getByRole('heading', { name: 'Organization credits', exact: true })).toBeVisible()
    await expectCreditBalance(page, 100)
    await expect(page.getByRole('region', { name: 'Add credits', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Set absolute balance', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Review addition', exact: true }).click()
    await expect(page.getByLabel('Credits to add', { exact: true })).toBeFocused()
    await expect(page.getByLabel('Credits to add', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expectCreditsAccessible(page)
    const canceled = await reviewCreditAddition(page, 25)
    await expect(canceled).toContainText(organization.name)
    await expect(canceled).toContainText('100')
    await expect(canceled).toContainText('25')
    expect(await savedAdjustments(page)).toBe(0)
    await expectCreditsAccessible(page)
    await page.keyboard.press('Escape')
    await expect(canceled).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Review addition', exact: true })).toBeFocused()
    expect(additions).toBe(0)
    await addCredits(page, 25)
    await expect.poll(() => additions).toBe(1)
    await expectCreditBalance(page, 100)
    await expect(page.getByRole('button', { name: 'Review addition', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Review absolute set', exact: true })).toBeDisabled()
    expect(storedBeforePost).toBe(true)
    expect(/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(key)).toBe(true)
    expect((await page.content()).includes(key)).toBe(false)
    release()
    await expectCreditBalance(page, 131)
    await expect.poll(() => savedAdjustments(page)).toBe(0)
    const set = await reviewAbsoluteBalance(page, 0)
    await expect(set).toContainText(organization.name)
    await expect(set).toContainText('131')
    await expectCreditsAccessible(page)
    await set.getByRole('button', { name: 'Set absolute balance', exact: true }).click()
    await expectCreditBalance(page, 0)
    expect(additions).toBe(1)
    expect(sets).toBe(1)
    await expect(page.getByRole('button', { name: 'Review absolute set', exact: true })).toBeEnabled()
    await expectCreditsAccessible(page)
    expect(errors.length).toBe(0)
    // Explicit synthetic-only review artifact; automatic screenshots remain disabled for privileged fixtures.
    if (process.env.PLATFORM_CREDITS_SCREENSHOTS === '1') {
        const directory = '/tmp/lef-platform-credits-review'
        await mkdir(directory, { recursive: true })
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.screenshot({ path: join(directory, `${info.project.name}.png`), fullPage: true })
    }
})

for (const failure of ['failed', 'timedout'] as const) {
    test(`${failure} additive response refreshes without causality and hard refresh offers only explicit same-key recovery`, async ({
        page,
        context,
    }) => {
        await account(context)
        const keys: string[] = []
        let balance = 100
        let detailReads = 0
        await context.route(`**/v1/organizations/${organization.id}`, route => {
            detailReads++
            return route.fulfill({ json: { ...organization, name: `${organization.name} ${detailReads}` } })
        })
        await context.route(`**${creditPath}`, route => {
            if (route.request().method() === 'POST') {
                keys.push(route.request().headers()['idempotency-key'])
                expect(route.request().postDataJSON()).toEqual({ amount: 25 })
                balance = 125
                if (keys.length === 1) return route.abort(failure)
                return route.fulfill({ status: 201, json: { balance } })
            }
            return route.fulfill({ json: { balance } })
        })
        await page.goto(path)
        await expectCreditBalance(page, 100)
        await addCredits(page, 25)
        await expectCreditBalance(page, 125)
        await expect(page.getByRole('button', { name: 'Retry same adjustment', exact: true })).toBeEnabled()
        await expect(page.getByRole('button', { name: 'Review addition', exact: true })).toBeDisabled()
        expect(keys.length).toBe(1)
        expect(await savedAdjustments(page)).toBe(1)
        await expectCreditsAccessible(page)
        await page.reload()
        await expectCreditBalance(page, 125)
        await expect(page.getByRole('region', { name: 'Current credit balance', exact: true })).toContainText(
            `${organization.name} 2`,
        )
        await expect(page.getByRole('button', { name: 'Retry same adjustment', exact: true })).toBeEnabled()
        expect(keys.length).toBe(1)
        expect((await page.content()).includes(keys[0])).toBe(false)
        await page.getByRole('button', { name: 'Retry same adjustment', exact: true }).click()
        await expect.poll(() => savedAdjustments(page)).toBe(0)
        await expectCreditBalance(page, 125)
        expect(keys.length === 2 && keys[0] === keys[1]).toBe(true)
        await expect(page.getByRole('button', { name: 'Review addition', exact: true })).toBeEnabled()
    })
}

test('conflict retains the adjustment and refreshes before acknowledged abandonment permits a new key', async ({
    page,
    context,
}) => {
    await account(context)
    const keys: string[] = []
    let balance = 100
    await context.route(`**${creditPath}`, route => {
        if (route.request().method() === 'POST') {
            keys.push(route.request().headers()['idempotency-key'])
            if (keys.length === 1) {
                balance = 180
                return route.fulfill({ status: 409, json: { statusCode: 409, message: 'Credit grant conflict' } })
            }
            balance += 25
            return route.fulfill({ status: 201, json: { balance } })
        }
        return route.fulfill({ json: { balance } })
    })
    await page.goto(path)
    await expectCreditBalance(page, 100)
    await addCredits(page, 25)
    await expectCreditBalance(page, 180)
    expect(await savedAdjustments(page)).toBe(1)
    await expect(page.getByRole('button', { name: 'Review addition', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Abandon unresolved adjustment', exact: true }).click()
    const abandon = page.getByRole('dialog', { name: 'Abandon unresolved adjustment', exact: true })
    await expect(abandon).toContainText(/may (?:already )?have applied/i)
    await expect(abandon).toContainText(/24.hour/i)
    await expect(abandon.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    await expectCreditsAccessible(page)
    await abandon.getByRole('button', { name: 'Acknowledge and abandon', exact: true }).click()
    expect(await savedAdjustments(page)).toBe(0)
    await addCredits(page, 25)
    await expectCreditBalance(page, 205)
    expect(keys.length === 2 && keys[0] !== keys[1]).toBe(true)
})

test('absolute set uncertainty reports only the observed balance and never resubmits on reload', async ({
    page,
    context,
}) => {
    await account(context)
    let balance = 100
    let sets = 0
    await context.route(`**${creditPath}`, route => {
        if (route.request().method() === 'PUT') {
            sets++
            balance = 500
            return route.abort('failed')
        }
        return route.fulfill({ json: { balance } })
    })
    await page.goto(path)
    await expectCreditBalance(page, 100)
    const dialog = await reviewAbsoluteBalance(page, 500)
    await dialog.getByRole('button', { name: 'Set absolute balance', exact: true }).click()
    await expectCreditBalance(page, 500)
    await expect(page.getByText(/current balance matches/i)).toBeVisible()
    expect(sets).toBe(1)
    expect(await savedAdjustments(page)).toBe(0)
    await expectCreditsAccessible(page)
    await page.reload()
    await expectCreditBalance(page, 500)
    expect(sets).toBe(1)
})

for (const status of [403, 404, 500]) {
    test(`organization detail ${status} reveals no balance and never requests credits`, async ({ page, context }) => {
        await account(context)
        let creditReads = 0
        await context.route(`**/v1/organizations/${organization.id}`, route =>
            route.fulfill({ status, json: { statusCode: status, message: 'Unavailable' } }),
        )
        await context.route(`**${creditPath}`, route => {
            creditReads++
            return route.fulfill({ json: { balance: 999_999 } })
        })
        await page.goto(path)
        await expect(page.getByRole('button', { name: 'Review addition', exact: true })).toHaveCount(0)
        await expect(page.getByRole('main')).toContainText(/denied|not found|unavailable|could not|unable|cannot/i)
        expect(creditReads).toBe(0)
        expect((await page.getByRole('main').innerText()).includes('999,999')).toBe(false)
        await expectCreditsAccessible(page)
    })
}

test('malformed routes return to the directory and customer capabilities expose neither entry nor balance', async ({
    page,
    context,
}) => {
    await account(context)
    let creditReads = 0
    await context.route('**/credits/*', route => {
        creditReads++
        return route.fulfill({ json: { balance: 100 } })
    })
    await page.goto('/app/platform/organizations/not-a-uuid/credits')
    await expect(page).toHaveURL(/\/app\/platform\/organizations$/)
    await expect(page.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible()
    await account(context, ['platform.organizations.manage'])
    await page.reload()
    await expect(page.getByText(organization.name, { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: `Manage credits for ${organization.name}`, exact: true })).toHaveCount(
        0,
    )
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
    expect(creditReads).toBe(0)
    await expectCreditsAccessible(page)
})

for (const invalid of ['malformed', 'other-principal', 'other-organization']) {
    test(`${invalid} recovery data is removed without displaying or resending it`, async ({ page, context }) => {
        await account(context)
        let additions = 0
        await context.route(`**${creditPath}`, route => {
            if (route.request().method() === 'POST') additions++
            return route.fulfill({ json: { balance: 100 } })
        })
        await page.goto(path)
        await expectCreditBalance(page, 100)
        const recoveredMembership = invalid === 'other-principal' ? randomUUID() : membershipId
        const value =
            invalid === 'malformed'
                ? '{invalid'
                : JSON.stringify({
                      version: 1,
                      membershipId: recoveredMembership,
                      organizationId: invalid === 'other-organization' ? randomUUID() : organization.id,
                      key: randomUUID(),
                      amount: 456_789,
                      state: 'unknown',
                      createdAt: Date.now(),
                  })
        await page.evaluate(({ storageKey, value }) => sessionStorage.setItem(storageKey, value), {
            storageKey: `${recoveryPrefix}${recoveredMembership}`,
            value,
        })
        await page.reload()
        await expectCreditBalance(page, 100)
        await expect(page.getByRole('button', { name: 'Review addition', exact: true })).toBeEnabled()
        await expect(page.getByRole('button', { name: 'Retry same adjustment', exact: true })).toHaveCount(0)
        expect(await savedAdjustments(page)).toBe(0)
        expect((await page.content()).includes('456,789')).toBe(false)
        expect(additions).toBe(0)
    })
}
