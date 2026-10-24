import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DataSource } from 'typeorm'
import { ApiKeyFixture } from '../better-auth/api-key-fixtures'

export const PLATFORM_ORGANIZATION_NAME = 'Platform Operations (development)'

/** The compiled helper proves checkout/stack ownership and persists keys through application ports. */
export async function bootstrapDevelopmentApiKey(
    kind: 'platform' | 'customer' | 'mcp-live',
    organizationId?: string,
): Promise<ApiKeyFixture> {
    execFileSync(
        process.execPath,
        ['scripts/better-auth/run-auth-tool.mjs', 'seed-api-key', kind, ...(organizationId ? [organizationId] : [])],
        { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 },
    )
    return JSON.parse(await readFile(resolve(`.dev/auth/${kind}-api-key.json`), 'utf8')) as ApiKeyFixture
}

/** Browser-operator seeding shares the platform organization, without touching credentials. */
export async function ensurePlatformOrganization(dataSource: DataSource): Promise<string> {
    const [existing] = await dataSource.query<Array<{ id: string }>>('SELECT id FROM organizations WHERE name = $1', [
        PLATFORM_ORGANIZATION_NAME,
    ])
    if (existing) return existing.id
    const [created] = await dataSource.query<Array<{ id: string }>>(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING id',
        [PLATFORM_ORGANIZATION_NAME],
    )
    return created.id
}
