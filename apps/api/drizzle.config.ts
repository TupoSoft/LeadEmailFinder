import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig } from 'drizzle-kit'

const target = process.env.D1_LOCAL_TARGET ?? 'dev'

if (target !== 'dev' && target !== 'test') {
    throw new Error('D1_LOCAL_TARGET must be dev or test.')
}

const directory = resolve('.wrangler/state', target, 'v3/d1')
const databases = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.sqlite') && entry.name !== 'metadata.sqlite')
    .map(entry => join(entry.parentPath, entry.name))

if (databases.length !== 1) {
    throw new Error(`Expected one local D1 database in ${directory}; run db:sync to initialize it.`)
}

const databasePath = databases[0]

export default defineConfig({
    dialect: 'sqlite',
    schema: process.env.DRIZZLE_D1_RESET_SCHEMA === '1' ? './scripts/empty-schema.ts' : './worker/database/schema.ts',
    dbCredentials: { url: pathToFileURL(databasePath).href },
    tablesFilter: ['better_auth_*'],
})
