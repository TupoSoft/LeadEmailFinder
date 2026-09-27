import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import type { components } from '@tuposoft/lead-email-finder-api-client'
import { withAsyncVerificationFixture } from '../../../../scripts/bruno/async-verification-fixture.mjs'
import { repositoryRoot } from '../support/browser-fixture-environment'
import { test, expect } from '../support/privileged-login'

type Completed = components['schemas']['AsyncVerificationCompletedResponseDto']

// The balance fixture's exclusive lock encloses every scenario change. Docker ownership is verified by that
// fixture before this helper can select the SMTP response; only a closed scenario value reaches the container.
function scenario(value: 'default' | 'target_accepted') {
    const project = process.env.COMPOSE_PROJECT_NAME ?? 'lef'
    const id = execFileSync(
        'docker',
        [
            'ps',
            '--quiet',
            '--filter',
            `label=com.docker.compose.project=${project}`,
            '--filter',
            'label=com.docker.compose.service=smtp-evidence',
        ],
        { encoding: 'utf8', timeout: 15_000 },
    ).trim()
    if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Owned SMTP fixture is unavailable')
    const directory = execFileSync(
        'docker',
        ['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project.working_dir"}}', id],
        { encoding: 'utf8', timeout: 15_000 },
    ).trim()
    if (![repositoryRoot, `${repositoryRoot}/docker`].includes(directory)) {
        throw new Error('SMTP fixture belongs to another checkout')
    }
    execFileSync(
        'docker',
        [
            'exec',
            id,
            'node',
            '-e',
            `fetch('http://127.0.0.1:8025/scenario',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({scenario:${JSON.stringify(value)}})}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`,
        ],
        { stdio: 'pipe', timeout: 15_000 },
    )
}

async function submit(page: Page, origin: string, email: string): Promise<Completed> {
    await page.goto(`${origin}/app/verifications/new`)
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(email)
    const accepted = page.waitForResponse(
        response => new URL(response.url()).pathname === '/verifyAsync' && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Verify email', exact: true }).click()
    const response = await accepted
    expect(response.status()).toBe(202)
    const { id } = (await response.json()) as { id: string }
    await expect(page).toHaveURL(`${origin}/app/verifications/${id}`)
    await expect(page.getByRole('heading', { name: 'Verification completed', exact: true })).toBeVisible({
        timeout: 70_000,
    })
    const status = await page.request.get(`${origin}/verifyAsync/${id}`)
    expect(status.status()).toBe(200)
    return (await status.json()) as Completed
}

test('fresh evidence charges once and cached evidence remains free at zero available credits', async ({ loginAs }) => {
    await withAsyncVerificationFixture(
        repositoryRoot,
        async fixture => {
            scenario('target_accepted')
            try {
                await fixture.setBalance(1)
                const page = await loginAs('owner')
                const email = `billing-${randomUUID()}@evidence.lef.test`
                const fresh = await submit(page, fixture.origin, email)
                expect(fresh.operation?.source).toBe('fresh')
                expect(fresh.operation?.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
                expect(fresh.operation?.cacheExpiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
                expect(Date.parse(fresh.operation!.cacheExpiresAt!)).toBeGreaterThan(
                    Date.parse(fresh.operation!.observedAt!),
                )
                expect(fresh.operation?.billing).toMatchObject({ state: 'settled', charged: 1, reason: 'conclusive' })
                await expect(page.getByLabel('Verification charges', { exact: true })).toContainText('1 credit charged')
                const cached = await submit(page, fixture.origin, email)
                expect(cached.operation?.source).toBe('cache')
                expect(cached.operation?.billing).toMatchObject({ state: 'settled', charged: 0, reason: 'cached' })
                expect(cached.operation?.observedAt).toBe(fresh.operation?.observedAt)
                await expect(page.getByText('Cached result', { exact: true })).toBeVisible()
                await expect(page.getByLabel('Verification charges', { exact: true })).toContainText(
                    'No credits charged',
                )
                const balance = await page.request.get(`${fixture.origin}/v1/billing/summary`)
                expect(await balance.json()).toEqual({ balance: 0, reserved: 0, available: 0 })
            } finally {
                scenario('default')
            }
        },
        { useOrganizationAdmin: true },
    )
})

test('real inconclusive SMTP evidence releases its reservation with no charge', async ({ loginAs }) => {
    await withAsyncVerificationFixture(
        repositoryRoot,
        async fixture => {
            scenario('default')
            await fixture.setBalance(1)
            const page = await loginAs('owner')
            const completed = await submit(page, fixture.origin, `inconclusive-${randomUUID()}@lef.test`)
            expect(completed.result.reason).toBe('accepted_email')
            expect(completed.result.catchAll).toBe(true)
            expect(completed.operation?.billing).toEqual({
                state: 'settled',
                reserved: 1,
                charged: 0,
                reason: 'inconclusive',
            })
            await expect(page.getByLabel('Verification charges', { exact: true })).toContainText('No credits charged')
            const balance = await page.request.get(`${fixture.origin}/v1/billing/summary`)
            expect(await balance.json()).toEqual({ balance: 1, reserved: 0, available: 1 })
        },
        { useOrganizationAdmin: true },
    )
})

test('duplicate batch charges only unique conclusive addresses and downloads every original row', async ({
    loginAs,
}) => {
    await withAsyncVerificationFixture(
        repositoryRoot,
        async fixture => {
            scenario('target_accepted')
            try {
                await fixture.setBalance(2)
                const page = await loginAs('owner')
                let posts = 0
                page.on('request', request => {
                    if (request.method() === 'POST' && new URL(request.url()).pathname === '/verifyBatch/csv') posts++
                })
                const first = `batch-first-${randomUUID()}@evidence.lef.test`
                const second = `batch-second-${randomUUID()}@evidence.lef.test`
                const addresses = [first, second, first, second]
                await page.goto(`${fixture.origin}/app/verifications/batches/new`)
                await page.getByLabel('CSV file', { exact: true }).setInputFiles({
                    name: 'duplicates.csv',
                    mimeType: 'text/csv',
                    buffer: Buffer.from(`email\n${addresses.join('\n')}\n`),
                })
                const accepted = page.waitForResponse(
                    response =>
                        new URL(response.url()).pathname === '/verifyBatch/csv' &&
                        response.request().method() === 'POST',
                )
                await page.getByRole('button', { name: 'Upload and verify CSV', exact: true }).click()
                const response = await accepted
                expect(response.status()).toBe(202)
                const { id } = (await response.json()) as { id: string }
                await expect(page).toHaveURL(`${fixture.origin}/app/verifications/batches/${id}`)
                await page.reload()
                await expect(
                    page.getByRole('heading', { name: 'Batch verification completed', exact: true }),
                ).toBeVisible({ timeout: 90_000 })
                const status = await page.request.get(`${fixture.origin}/verifyBatch/${id}`)
                const completed = (await status.json()) as { counts: unknown; billing: unknown }
                expect(completed.counts).toMatchObject({ totalRows: 4, uniqueAddresses: 2, duplicateRows: 2 })
                expect(completed.billing).toMatchObject({ state: 'settled', charged: 2 })
                await expect(page.getByLabel('Verification charges', { exact: true })).toContainText(
                    '2 credits charged',
                )
                const pendingDownload = page.waitForEvent('download')
                await page.getByRole('button', { name: 'Download result CSV', exact: true }).click()
                const download = await pendingDownload
                const stream = await download.createReadStream()
                if (!stream) throw new Error('CSV stream is missing')
                const chunks: Buffer[] = []
                for await (const chunk of stream) {
                    if (!Buffer.isBuffer(chunk)) throw new Error('CSV stream contains invalid bytes')
                    chunks.push(chunk)
                }
                const [header, ...rows] = Buffer.concat(chunks).toString('utf8').trim().split(/\r?\n/)
                const columns = header.split(',')
                const emailColumn = columns.indexOf('email')
                const chargeColumn = columns.indexOf('creditsCharged')
                expect(emailColumn).toBeGreaterThanOrEqual(0)
                expect(chargeColumn).toBeGreaterThanOrEqual(0)
                expect(rows.map(row => row.split(',')[emailColumn])).toEqual(addresses)
                expect(rows.reduce((sum, row) => sum + Number(row.split(',')[chargeColumn]), 0)).toBe(2)
                await download.delete()
                expect(posts).toBe(1)
                const balance = await page.request.get(`${fixture.origin}/v1/billing/summary`)
                expect(await balance.json()).toEqual({ balance: 0, reserved: 0, available: 0 })
            } finally {
                scenario('default')
            }
        },
        { useOrganizationAdmin: true },
    )
})
