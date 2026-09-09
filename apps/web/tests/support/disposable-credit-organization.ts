import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'

export interface DisposableCreditOrganization {
    organizationId: string
    invitationId: string
    name: string
}

export async function createCreditOrganization(page: Page): Promise<DisposableCreditOrganization> {
    const name = `Browser credits ${randomUUID()}`
    const ownerEmail = `credits-owner-${randomUUID()}@example.test`
    const identifiers = await page.evaluate(
        async ({ name, ownerEmail }) => {
            const cookie = document.cookie.split(';').find(value => value.trim().startsWith('lef_csrf_token='))
            const csrf = cookie ? decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1).trim()) : ''
            const response = await fetch('/v1/organizations', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
                body: JSON.stringify({ name, ownerEmail }),
            })
            // Project immediately: never return or persist the first-owner invitation token.
            const { organizationId, invitation } = (await response.json()) as {
                organizationId?: unknown
                invitation?: { id?: unknown }
            }
            return { status: response.status, organizationId, invitationId: invitation?.id }
        },
        { name, ownerEmail },
    )
    if (
        identifiers.status !== 201 ||
        typeof identifiers.organizationId !== 'string' ||
        typeof identifiers.invitationId !== 'string'
    ) {
        throw new Error('Disposable credit organization creation failed.')
    }
    return { name, organizationId: identifiers.organizationId, invitationId: identifiers.invitationId }
}

export function cleanupCreditOrganization(repositoryRoot: string, created: DisposableCreditOrganization): void {
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
        !created.name.startsWith('Browser credits ')) throw new Error('Invalid fixture')
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
        'SELECT 1 FROM audit_log_entries WHERE "organizationId" = $1 UNION ALL ' +
        'SELECT 1 FROM organization_credit_accounts WHERE "organizationId" = $1 UNION ALL ' +
        'SELECT 1 FROM credit_grants WHERE "organizationId" = $1 UNION ALL ' +
        'SELECT 1 FROM credit_debits WHERE "organizationId" = $1',
        [created.organizationId, created.invitationId],
    )
    if (remaining.rowCount !== 0) throw new Error('Fixture cleanup did not finish')
    await client.query('COMMIT')
} catch {
    await client?.query('ROLLBACK').catch(() => undefined)
    process.stderr.write('Disposable credit organization cleanup failed.\\n')
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
        throw new Error('Disposable credit organization cleanup failed; inspect the owned test fixture.')
    }
}
