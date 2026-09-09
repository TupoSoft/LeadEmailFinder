import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '../support/privileged-login'
import { browserFixtureEnvironment } from '../support/browser-fixture-environment'
import { installServiceClientExportSink, serviceClientExportEvidence } from '../support/service-client-exports'
import { serviceClientsCopy as copy } from '../../src/features/service-clients/service-clients-copy'

test('seeded human owner creates, lists, explicitly exports, rotates, disables, and deletes a disposable client', async ({
    page,
    loginAs,
}) => {
    const { origin } = await browserFixtureEnvironment()
    await installServiceClientExportSink(page)
    const owner = await loginAs('owner')
    const description = `Browser lifecycle ${randomUUID()}`
    await owner.goto(`${origin}/app/service-clients`)
    await expect(owner.getByRole('heading', { name: copy.title, exact: true })).toBeVisible()
    await expect(owner).toHaveTitle('Service clients | Lead Email Finder')
    let clientId: string | undefined
    try {
        await owner.getByLabel(copy.descriptionLabel, { exact: true }).fill(description)
        await owner.getByRole('checkbox', { name: 'verification:run', exact: true }).check()
        const createdResponse = owner.waitForResponse(
            response =>
                response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/service-clients'),
        )
        await owner.getByRole('button', { name: copy.create, exact: true }).click()
        const created = await createdResponse
        // Retain only metadata immediately so even an export or accessibility failure can clean up.
        const issuedId = ((await created.json()) as { clientId?: unknown }).clientId
        clientId = typeof issuedId === 'string' ? issuedId : undefined
        expect(created.status()).toBe(201)
        expect(created.headers()['cache-control'] === 'no-store').toBe(true)
        const dialog = owner.getByRole('dialog', { name: copy.secretTitle, exact: true })
        await expect(dialog).toBeVisible()
        const audit = await new AxeBuilder({ page: owner })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        expect(audit.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? '')).length).toBe(0)
        await dialog.getByRole('button', { name: copy.copy, exact: true }).click()
        await dialog.getByRole('button', { name: copy.download, exact: true }).click()
        await expect.poll(async () => (await serviceClientExportEvidence(owner)).downloaded).toBe(true)
        const exports = await serviceClientExportEvidence(owner)
        expect(exports.copied && exports.filenameSafe && exports.revoked > 0).toBe(true)
        await dialog.getByRole('button', { name: copy.close, exact: true }).click()
        await expect(owner.getByLabel(copy.secretLabel, { exact: true })).toHaveCount(0)
        const listedResponse = owner.waitForResponse(
            response =>
                response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/service-clients'),
        )
        await owner.getByRole('button', { name: copy.refresh, exact: true }).click()
        const listed = (await (await listedResponse).json()) as {
            clientId: string
            description: string
            clientSecret?: unknown
        }[]
        expect(listed.every(item => !Object.hasOwn(item, 'clientSecret'))).toBe(true)
        clientId = listed.find(item => item.description === description)?.clientId
        expect(typeof clientId === 'string').toBe(true)
        const row = owner.getByRole('row').filter({ hasText: description })
        await expect(row).toContainText('Active')
        await owner.getByRole('button', { name: `Rotate secret for ${clientId}`, exact: true }).click()
        const rotation = owner.getByRole('dialog', { name: copy.rotateTitle, exact: true })
        await expect(rotation.getByRole('button', { name: copy.cancel, exact: true })).toBeFocused()
        const rotatedResponse = owner.waitForResponse(
            response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/rotate'),
        )
        await rotation.getByRole('button', { name: copy.rotate, exact: true }).click()
        const rotated = await rotatedResponse
        expect(rotated.status()).toBe(200)
        expect(rotated.headers()['cache-control'] === 'no-store').toBe(true)
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: copy.close, exact: true }).click()
        await owner.getByRole('button', { name: `Disable client ${clientId}`, exact: true }).click()
        const disable = owner.getByRole('dialog', { name: copy.disableTitle, exact: true })
        await expect(disable).toContainText(copy.disableConsequence)
        const disabledResponse = owner.waitForResponse(
            response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/disable'),
        )
        await disable.getByRole('button', { name: copy.disable, exact: true }).click()
        expect((await disabledResponse).status()).toBe(204)
        await expect(row).toContainText('Disabled')
        const rotate = owner.getByRole('button', { name: `Rotate secret for ${clientId}`, exact: true })
        expect((await rotate.count()) === 0 || (await rotate.isDisabled())).toBe(true)
        await owner.getByRole('button', { name: `Delete client ${clientId}`, exact: true }).click()
        const deletion = owner.getByRole('dialog', { name: copy.deleteTitle, exact: true })
        await expect(deletion).toContainText(clientId!)
        const deletedResponse = owner.waitForResponse(
            response =>
                response.request().method() === 'DELETE' &&
                new URL(response.url()).pathname.includes('/service-clients/'),
        )
        await deletion.getByRole('button', { name: copy.delete, exact: true }).click()
        expect((await deletedResponse).status()).toBe(204)
        await expect(row).toHaveCount(0)
        clientId = undefined
        await owner.reload()
        await expect(owner.getByLabel(copy.secretLabel, { exact: true })).toHaveCount(0)
        expect(
            await owner.evaluate(
                () => localStorage.length === 0 && sessionStorage.length === 0 && !location.search && !location.hash,
            ),
        ).toBe(true)
    } finally {
        // Clean only the uniquely described client from this test, through the same authorized UI.
        // Closing the browser clears all test-local export buffers regardless of cleanup outcome.
        if (clientId) {
            // End the previous document before observing the new authoritative read.
            await owner.goto(`${origin}/`)
            const cleanupList = owner.waitForResponse(
                response =>
                    response.request().method() === 'GET' &&
                    new URL(response.url()).pathname.endsWith('/service-clients'),
            )
            await owner.goto(`${origin}/app/service-clients`)
            await expect(owner.getByRole('heading', { name: copy.title, exact: true })).toBeVisible()
            const response = await cleanupList
            expect(response.status()).toBe(200)
            await expect(owner.getByRole('region', { name: copy.list, exact: true })).toHaveAttribute(
                'aria-busy',
                'false',
            )
            const remove = owner.getByRole('button', { name: `Delete client ${clientId}`, exact: true })
            if (await remove.count()) {
                await expect(remove).toBeVisible()
                await remove.click()
                await owner
                    .getByRole('dialog', { name: copy.deleteTitle })
                    .getByRole('button', { name: copy.delete, exact: true })
                    .click()
                await expect(owner.getByRole('row').filter({ hasText: description })).toHaveCount(0)
            }
        }
    }
})
