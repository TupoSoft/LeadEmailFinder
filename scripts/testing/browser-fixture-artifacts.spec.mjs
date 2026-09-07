import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const webRoot = join(repositoryRoot, 'apps/web')
const require = createRequire(join(webRoot, 'package.json'))

const scenarios = [
    { name: 'authentication-failure', timeoutGuard: false },
    { name: 'runner-timeout', timeoutGuard: true },
    ...['trace', 'screenshot', 'video'].map(override => ({ name: `${override}-override`, override })),
]

// Run explicitly after installing Chromium; this is not a browser-free unit-test suite.
for (const { name, timeoutGuard, override } of scenarios) test(`shared-fixture ${name} protection prevents auth capture`, { timeout: 60_000 }, () => {
    const directory = mkdtempSync(join(tmpdir(), 'lef-browser-artifact-guard-'))
    const outputDirectory = join(directory, 'results')
    const syntheticMaterial = 'SYNTHETIC_AUTH_MATERIAL_MUST_NEVER_REACH_OUTPUT'
    const configuration = join(directory, 'playwright.config.ts')
    const fixtureModule = join(webRoot, 'tests/support/privileged-login.ts')
    const reporter = join(webRoot, 'tests/support/browser-fixture-reporter.ts')
    const bodyMarker = join(directory, 'test-body-ran')
    try {
        writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n', { mode: 0o600 })
        writeFileSync(configuration, `
import configuration from ${JSON.stringify(join(webRoot, 'playwright.privileged.config.ts'))}
export default {
    ...configuration,
    testDir: ${JSON.stringify(directory)},
    testMatch: 'auth-failure.spec.ts',
    reporter: ${JSON.stringify(reporter)},
    outputDir: ${JSON.stringify(outputDirectory)},
}
`, { mode: 0o600 })
        writeFileSync(join(directory, 'auth-failure.spec.ts'), `
import { writeFileSync } from 'node:fs'
import { test } from ${JSON.stringify(fixtureModule)}
${override ? `test.use(${JSON.stringify({ [override]: 'on' })})` : ''}
test('owner guarded authentication failure', async ({ page, loginAs }) => {
    writeFileSync(${JSON.stringify(bodyMarker)}, 'body-ran', { mode: 0o600 })
    await page.setContent('<input aria-label="Synthetic auth value">')
    await page.getByLabel('Synthetic auth value').fill(${JSON.stringify(syntheticMaterial)})
    // Rejection happens before any Docker lookup or mutation of development fixture metadata.
    process.env.COMPOSE_PROJECT_NAME = 'invalid fixture project'
    ${timeoutGuard ? `
    const context = page.context()
    const close = context.close.bind(context)
    context.close = async (...options) => {
        await new Promise(resolve => setTimeout(resolve, 1_200))
        return close(...options)
    }
    // The fixture must replace this framework deadline with its bounded, sanitized auth deadline.
    test.setTimeout(1_000)
    ` : ''}
    await loginAs('owner')
})
`, { mode: 0o600 })
        const environment = { ...process.env }
        for (const key of ['DEBUG', 'PWDEBUG', 'PW_TEST_DEBUG', 'PW_TEST_REUSE_CONTEXT', 'PWDEBUGIMPL']) delete environment[key]
        const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', `--config=${configuration}`], {
            cwd: webRoot,
            env: environment,
            encoding: 'utf8',
            timeout: 45_000,
            maxBuffer: 1_000_000,
        })
        assert.equal(Boolean(result.error), false, 'The artifact guard must execute Playwright successfully')
        assert.equal(result.status, 1, 'The intentional authentication rejection must fail its child test')
        const output = `${result.stdout}\n${result.stderr}`
        assert.equal(output.includes('owner: FAIL'), true, 'The dedicated reporter must report the failed identity')
        assert.equal(output.includes('Confirm stack ownership'), true, 'The failure must include static recovery guidance')
        assert.equal(output.includes(syntheticMaterial), false, 'Authentication material must not appear in process output')
        assert.equal(existsSync(bodyMarker), !override, 'Unsafe file-level capture options must fail before the test body accesses authentication material')
        if (!override) {
            // Playwright keeps its pass/fail bookkeeping; even an error-context Markdown attachment is forbidden.
            assert.deepEqual(readdirSync(outputDirectory, { recursive: true }).sort(), ['.last-run.json'])
        }
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
})
