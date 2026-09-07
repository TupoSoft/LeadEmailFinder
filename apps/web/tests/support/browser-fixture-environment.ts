import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { browserFixtureError, readBrowserSeedMetadata } from './browser-fixture-metadata.ts'

export const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '')

export async function browserFixtureEnvironment() {
    try {
        if (process.env.DEBUG || process.env.PWDEBUG || process.env.PW_TEST_DEBUG) throw browserFixtureError()
        const output = execFileSync(process.execPath, ['scripts/testing/browser-fixture-stack.mjs'], {
            cwd: repositoryRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 30_000,
        })
        const endpoints = JSON.parse(output) as { origin: string; issuer: string }
        const seed = await readBrowserSeedMetadata(repositoryRoot, endpoints.issuer)
        return { ...endpoints, seed, repositoryRoot }
    } catch {
        throw browserFixtureError()
    }
}
