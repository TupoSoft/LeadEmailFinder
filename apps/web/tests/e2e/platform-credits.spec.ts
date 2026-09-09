import { randomUUID } from 'node:crypto'
import { test, expect } from '../support/privileged-login'
import { browserFixtureEnvironment } from '../support/browser-fixture-environment'
import { createCreditOrganization, cleanupCreditOrganization } from '../support/disposable-credit-organization'
import {
    addCredits,
    expectCreditBalance,
    expectCreditsAccessible,
    reviewAbsoluteBalance,
} from '../support/platform-credits'

test('MFA operator adjusts an owned organization and recovers real replay, conflict and lost-set outcomes', async ({
    loginAs,
}) => {
    const { origin, repositoryRoot } = await browserFixtureEnvironment()
    const page = await loginAs('platformOperator')
    const created = await createCreditOrganization(page)
    const creditPath = `/credits/${created.organizationId}`
    const path = `/app/platform/organizations/${created.organizationId}/credits`
    let additions = 0
    let sets = 0
    let pageErrors = 0
    const statuses: number[] = []
    const keys: string[] = []
    page.on('pageerror', () => pageErrors++)
    page.on('request', request => {
        if (new URL(request.url()).pathname !== creditPath) return
        if (request.method() === 'POST') {
            additions++
            keys.push(request.headers()['idempotency-key'])
        }
        if (request.method() === 'PUT') sets++
    })
    try {
        await page.goto(`${origin}/app/platform/organizations`)
        await page.getByRole('link', { name: `Manage credits for ${created.name}`, exact: true }).click()
        await expect(page).toHaveTitle('Organization credits | Lead Email Finder')
        await expectCreditBalance(page, 0)
        await expectCreditsAccessible(page)
        const set = await reviewAbsoluteBalance(page, 100)
        const setResponse = page.waitForResponse(
            response => new URL(response.url()).pathname === creditPath && response.request().method() === 'PUT',
        )
        await set.getByRole('button', { name: 'Set absolute balance', exact: true }).click()
        expect((await setResponse).status()).toBe(200)
        await expectCreditBalance(page, 100)
        const addResponse = page.waitForResponse(
            response => new URL(response.url()).pathname === creditPath && response.request().method() === 'POST',
        )
        await addCredits(page, 25)
        expect((await addResponse).status()).toBe(201)
        await expectCreditBalance(page, 125)

        let lostAdd = true
        await page.route(`**${creditPath}`, async route => {
            if (route.request().method() !== 'POST') return route.continue()
            const response = await route.fetch()
            statuses.push(response.status())
            if (lostAdd) {
                lostAdd = false
                return route.abort('timedout')
            }
            return route.fulfill({ response })
        })
        await addCredits(page, 10)
        await expectCreditBalance(page, 135)
        await expect(page.getByRole('button', { name: 'Retry same adjustment', exact: true })).toBeEnabled()
        expect(additions).toBe(2)
        await page.reload()
        await expect(page).toHaveURL(`${origin}${path}`)
        await expectCreditBalance(page, 135)
        await expect(page.getByRole('region', { name: 'Current credit balance', exact: true })).toContainText(
            created.name,
        )
        await expect(page.getByRole('button', { name: 'Retry same adjustment', exact: true })).toBeEnabled()
        expect(additions).toBe(2)
        await page.getByRole('button', { name: 'Retry same adjustment', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Review addition', exact: true })).toBeEnabled()
        await expectCreditBalance(page, 135)
        expect(additions === 3 && keys[1] === keys[2]).toBe(true)
        expect(statuses).toEqual([201, 201])
        await page.unroute(`**${creditPath}`)

        await page.setViewportSize({ width: 320, height: 720 })
        await page.route(`**${creditPath}`, async route => {
            if (route.request().method() !== 'POST') return route.continue()
            // Establish a real server conflict by binding this new key to a different amount first.
            const existing = await route.fetch({ postData: JSON.stringify({ amount: 6 }) })
            statuses.push(existing.status())
            const conflict = await route.fetch()
            statuses.push(conflict.status())
            return route.fulfill({ response: conflict })
        })
        await addCredits(page, 5)
        await expectCreditBalance(page, 141)
        await expect(page.getByRole('button', { name: 'Review addition', exact: true })).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Retry same adjustment', exact: true })).toHaveCount(0)
        expect(statuses).toEqual([201, 201, 201, 409])
        await expectCreditsAccessible(page)
        await page.getByRole('button', { name: 'Abandon unresolved adjustment', exact: true }).click()
        const abandon = page.getByRole('dialog', { name: 'Abandon unresolved adjustment', exact: true })
        await expect(abandon).toContainText(/may (?:already )?have applied/i)
        await expectCreditsAccessible(page)
        await abandon.getByRole('button', { name: 'Acknowledge and abandon', exact: true }).click()
        await page.unroute(`**${creditPath}`)

        await page.route(`**${creditPath}`, async route => {
            if (route.request().method() !== 'PUT') return route.continue()
            const applied = await route.fetch()
            statuses.push(applied.status())
            return route.abort('failed')
        })
        const uncertainSet = await reviewAbsoluteBalance(page, 500)
        await uncertainSet.getByRole('button', { name: 'Set absolute balance', exact: true }).click()
        await expectCreditBalance(page, 500)
        await expect(page.getByText(/current balance matches/i)).toBeVisible()
        await expectCreditsAccessible(page)
        expect(sets).toBe(2)
        await page.reload()
        await expectCreditBalance(page, 500)
        expect(sets).toBe(2)
        await page.unroute(`**${creditPath}`)
        const reset = await reviewAbsoluteBalance(page, 0)
        await reset.getByRole('button', { name: 'Set absolute balance', exact: true }).click()
        await expectCreditBalance(page, 0)
        expect(statuses).toEqual([201, 201, 201, 409, 200])
        expect(additions).toBe(4)
        expect(sets).toBe(3)
        expect(pageErrors).toBe(0)
        expect(
            await page.evaluate(() =>
                Object.keys(sessionStorage).some(key => key.startsWith('lef-platform-credit-adjustment:')),
            ),
        ).toBe(false)
    } finally {
        await page.unroute(`**${creditPath}`)
        cleanupCreditOrganization(repositoryRoot, created)
    }
})

test('customer owner cannot enter the credit route or call platform detail/read/add/set operations', async ({
    loginAs,
}) => {
    const { origin } = await browserFixtureEnvironment()
    const page = await loginAs('owner')
    const organizationId = await page.evaluate(async () => {
        const account = await fetch('/v1/auth/session')
        return ((await account.json()) as { organization: { id: string } }).organization.id
    })
    await page.goto(`${origin}/app/platform/organizations/${organizationId}/credits`)
    await expect(page.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
    await expect(page.getByLabel('Credits to add', { exact: true })).toHaveCount(0)
    const denied = await page.evaluate(
        async ({ organizationId, key }) => {
            const cookie = document.cookie.split(';').find(value => value.trim().startsWith('lef_csrf_token='))
            const csrf = cookie ? decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1).trim()) : ''
            const outcomes: { status: number; disclosed: boolean }[] = []
            for (const operation of [
                { path: `/v1/organizations/${organizationId}`, method: 'GET' },
                { path: `/credits/${organizationId}`, method: 'GET' },
                { path: `/credits/${organizationId}`, method: 'POST' },
                { path: `/credits/${organizationId}`, method: 'PUT' },
            ]) {
                const response = await fetch(operation.path, {
                    method: operation.method,
                    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, 'idempotency-key': key },
                    ...(operation.method !== 'GET' ? { body: JSON.stringify({ amount: 1 }) } : {}),
                })
                const body = (await response.json()) as Record<string, unknown>
                outcomes.push({
                    status: response.status,
                    disclosed: Object.hasOwn(body, 'balance') || Object.hasOwn(body, 'name'),
                })
            }
            return outcomes
        },
        { organizationId, key: randomUUID() },
    )
    expect(denied).toEqual(Array.from({ length: 4 }, () => ({ status: 403, disclosed: false })))
    await expectCreditsAccessible(page)
})
