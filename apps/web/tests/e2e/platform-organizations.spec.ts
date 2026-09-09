import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '../support/privileged-login'
import { browserFixtureEnvironment } from '../support/browser-fixture-environment'

interface CreatedOrganization {
    organizationId: string
    invitationId: string
    name: string
}

function cleanupOrganization(repositoryRoot: string, created: CreatedOrganization): void {
    try {
        execFileSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                `
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { loadDevelopmentStack } from './scripts/testing/development-stack.mjs'
const { Client } = createRequire(import.meta.url)('pg')
let client
try {
    const created = JSON.parse(readFileSync(0, 'utf8'))
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
    if (!uuid.test(created.organizationId) || !uuid.test(created.invitationId) ||
        !created.name.startsWith('Browser organization ')) throw new Error('Invalid fixture')
    const stack = loadDevelopmentStack(process.cwd(), { persistMetadata: false })
    client = new Client({ connectionString: stack.postgresUrl })
    await client.connect()
    await client.query('BEGIN')
    const removed = await client.query(
        'DELETE FROM organizations WHERE id = $1 AND name = $2 AND EXISTS (' +
        'SELECT 1 FROM organization_invitations WHERE id = $3 AND "organizationId" = $1) RETURNING id',
        [created.organizationId, created.name, created.invitationId],
    )
    if (removed.rowCount !== 1) throw new Error('Fixture ownership did not match')
    const remaining = await client.query(
        'SELECT 1 FROM organizations WHERE id = $1 UNION ALL ' +
        'SELECT 1 FROM organization_invitations WHERE id = $2 OR "organizationId" = $1 UNION ALL ' +
        'SELECT 1 FROM audit_log_entries WHERE "organizationId" = $1',
        [created.organizationId, created.invitationId],
    )
    if (remaining.rowCount !== 0) throw new Error('Fixture cleanup did not finish')
    await client.query('COMMIT')
} catch {
    await client?.query('ROLLBACK').catch(() => undefined)
    process.stderr.write('Synthetic organization cleanup failed.\\n')
    process.exitCode = 1
} finally {
    await client?.end()
}
`,
            ],
            {
                cwd: repositoryRoot,
                input: JSON.stringify(created),
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 30_000,
            },
        )
    } catch {
        throw new Error('Synthetic organization cleanup failed; inspect the captured fixture identifiers.')
    }
}

test('MFA platform operator creates one organization, copies its first-owner link once, and reads metadata only', async ({
    loginAs,
}) => {
    const { origin, repositoryRoot } = await browserFixtureEnvironment()
    const operator = await loginAs('platformOperator')
    await operator.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const name = `Browser organization ${randomUUID()}`
    const email = `first-owner-${randomUUID()}@example.test`
    let created: CreatedOrganization | undefined
    let invitationUrl = ''
    let creation: Promise<{ status: number; noStore: boolean }> | undefined
    let creationRequests = 0
    let runtimeErrors = 0
    operator.on('pageerror', () => runtimeErrors++)
    operator.on('console', message => {
        if (message.type() === 'error') runtimeErrors++
    })
    operator.on('request', request => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/v1/organizations') creationRequests++
    })

    try {
        await operator.goto(`${origin}/app/platform/organizations`)
        await expect(operator).toHaveTitle('Organizations | Lead Email Finder')
        await expect(operator.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible()
        await expect(operator.getByRole('link', { name: 'Organizations', exact: true })).toBeVisible()
        await expect(operator.getByRole('region', { name: 'Organization directory', exact: true })).toHaveAttribute(
            'aria-busy',
            'false',
        )
        await operator.getByLabel('Organization name', { exact: true }).fill(name)
        await operator.getByLabel('First owner email', { exact: true }).fill(email)
        creation = operator
            .waitForResponse(
                response =>
                    response.request().method() === 'POST' && new URL(response.url()).pathname === '/v1/organizations',
            )
            .then(async response => {
                // Project immediately, including when the submitting click fails after the request succeeds.
                const identifiers = (({ organizationId, invitation }) => ({
                    organizationId,
                    invitationId: invitation?.id,
                }))((await response.json()) as { organizationId?: unknown; invitation?: { id?: unknown } })
                if (typeof identifiers.organizationId === 'string' && typeof identifiers.invitationId === 'string') {
                    created = {
                        organizationId: identifiers.organizationId,
                        invitationId: identifiers.invitationId,
                        name,
                    }
                }
                return { status: response.status(), noStore: response.headers()['cache-control'] === 'no-store' }
            })
        void creation.catch(() => undefined)
        await operator.getByRole('button', { name: 'Create organization', exact: true }).click()
        const response = await creation
        expect(created !== undefined).toBe(true)
        expect(response).toEqual({ status: 201, noStore: true })
        const dialog = operator.getByRole('dialog', { name: 'Organization created', exact: true })
        await expect(dialog).toBeVisible()
        const link = operator.getByLabel('First owner invitation link', { exact: true })
        invitationUrl = await link.inputValue()
        const parsed = new URL(invitationUrl)
        expect(parsed.origin === origin && /^\/accept-invitation\/[^/]+$/.test(parsed.pathname)).toBe(true)
        expect(!parsed.search && !parsed.hash).toBe(true)
        await expect(dialog.getByRole('button', { name: 'Copy invitation link', exact: true })).toBeFocused()
        const accessibility = await new AxeBuilder({ page: operator })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        expect(
            accessibility.violations.filter(value => ['serious', 'critical'].includes(value.impact ?? '')).length,
        ).toBe(0)
        expect(
            await operator.evaluate(
                value => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(value),
                invitationUrl,
            ),
        ).toBe(false)
        await dialog.getByRole('button', { name: 'Copy invitation link', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        expect(
            await operator.evaluate(
                value => navigator.clipboard.readText().then(text => text === value),
                invitationUrl,
            ),
        ).toBe(true)
        await operator.evaluate(() => navigator.clipboard.writeText(''))
        expect((await operator.content()).includes(invitationUrl)).toBe(false)
        invitationUrl = ''
        await expect(link).toHaveCount(0)
        await expect(operator.getByLabel('Organization name', { exact: true })).toHaveValue('')
        await expect(operator.getByLabel('First owner email', { exact: true })).toHaveValue('')

        const refreshed = operator.waitForResponse(
            result => result.request().method() === 'GET' && new URL(result.url()).pathname === '/v1/organizations',
        )
        await operator.getByRole('button', { name: 'Refresh organizations', exact: true }).click()
        const directoryResponse = await refreshed
        expect(directoryResponse.status()).toBe(200)
        const directory = (await directoryResponse.json()) as {
            organizations: { id: string; name: string; createdAt: string; updatedAt: string }[]
            nextPageToken?: string
        }
        expect(Object.keys(directory).every(key => ['organizations', 'nextPageToken'].includes(key))).toBe(true)
        expect(
            directory.organizations.every(row => Object.keys(row).sort().join(',') === 'createdAt,id,name,updatedAt'),
        ).toBe(true)
        expect(directory.organizations.some(row => row.id === created?.organizationId && row.name === name)).toBe(true)
        expect(
            directory.nextPageToken === undefined ||
                (typeof directory.nextPageToken === 'string' && directory.nextPageToken.length > 0),
        ).toBe(true)
        await expect(operator.getByRole('row').filter({ hasText: created!.organizationId })).toContainText(name)
        await operator.reload()
        await expect(operator.getByRole('heading', { name: 'Organizations', exact: true })).toBeVisible()
        await expect(link).toHaveCount(0)
        await expect(operator.locator('vite-error-overlay')).toHaveCount(0)
        expect(creationRequests).toBe(1)
        expect(runtimeErrors).toBe(0)
    } finally {
        invitationUrl = ''
        await creation?.catch(() => undefined)
        await operator.evaluate(() => navigator.clipboard.writeText('')).catch(() => undefined)
        if (created) cleanupOrganization(repositoryRoot, created)
    }
})

test('customer owner cannot discover platform organizations through navigation, a direct route, or the API', async ({
    loginAs,
}) => {
    const { origin } = await browserFixtureEnvironment()
    const owner = await loginAs('owner')
    await expect(owner.getByRole('link', { name: 'Organizations', exact: true })).toHaveCount(0)
    await owner.goto(`${origin}/app/platform/organizations`)
    await expect(owner.getByRole('heading', { name: 'Access denied', exact: true })).toBeVisible()
    await expect(owner.getByLabel('Organization name', { exact: true })).toHaveCount(0)
    const denied = await owner.evaluate(async () => {
        const response = await fetch('/v1/organizations?pageSize=1')
        const body = (await response.json()) as Record<string, unknown>
        return { status: response.status, containsDirectory: Object.hasOwn(body, 'organizations') }
    })
    expect(denied).toEqual({ status: 403, containsDirectory: false })
})
