import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const web = join(root, 'apps/web')
const require = createRequire(join(web, 'package.json'))

test(
    'verification assertions never record job URLs, addresses, or page snapshots after authentication',
    { timeout: 60_000 },
    () => {
        const directory = mkdtempSync(join(tmpdir(), 'lef-verification-artifact-guard-'))
        const output = join(directory, 'results')
        const marker = 'SYNTHETIC_VERIFICATION_MATERIAL_MUST_NOT_BE_RECORDED'
        try {
            writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n', { mode: 0o600 })
            writeFileSync(
                join(directory, 'playwright.config.ts'),
                `
import configuration from ${JSON.stringify(join(web, 'playwright.verification.config.ts'))}
export default {
    ...configuration,
    testDir: ${JSON.stringify(directory)},
    testMatch: 'single-verification.spec.ts',
    reporter: ${JSON.stringify(join(web, 'tests/support/browser-fixture-reporter.ts'))},
    outputDir: ${JSON.stringify(output)},
}
`,
                { mode: 0o600 },
            )
            writeFileSync(
                join(directory, 'single-verification.spec.ts'),
                `
import { test, expect } from ${JSON.stringify(join(web, 'tests/support/privileged-login.ts'))}
test('owner guarded verification assertion', async ({ page }) => {
    await page.setContent('<main>${marker}</main>')
    await expect(page).toHaveURL('http://example.test/app/verifications/${marker}', { timeout: 50 })
})
`,
                { mode: 0o600 },
            )
            const environment = { ...process.env }
            for (const key of ['DEBUG', 'PWDEBUG', 'PW_TEST_DEBUG', 'PW_TEST_REUSE_CONTEXT', 'PWDEBUGIMPL'])
                delete environment[key]
            const result = spawnSync(
                process.execPath,
                [
                    require.resolve('@playwright/test/cli'),
                    'test',
                    `--config=${join(directory, 'playwright.config.ts')}`,
                ],
                {
                    cwd: web,
                    env: environment,
                    encoding: 'utf8',
                    timeout: 45_000,
                    maxBuffer: 1_000_000,
                },
            )
            assert.equal(Boolean(result.error), false)
            assert.equal(result.status, 1)
            assert.ok(!`${result.stdout}\n${result.stderr}`.includes(marker))
            assert.deepEqual(readdirSync(output, { recursive: true }).sort(), ['.last-run.json'])
            assert.ok(!readFileSync(join(output, '.last-run.json'), 'utf8').includes(marker))
        } finally {
            rmSync(directory, { recursive: true, force: true })
        }
    },
)
