import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const webRoot = join(repositoryRoot, 'apps/web')
const require = createRequire(join(webRoot, 'package.json'))
const scenarios = [
    { name: 'assertion-failure' },
    { name: 'dom-assertion-failure', dom: true },
    { name: 'runner-timeout', timeout: true },
    { name: 'late-teardown-output', late: true },
]

// Browser-dependent: run explicitly after Chromium installation. All secret
// markers originate in memory; generated source and config files contain none.
for (const configurationName of ['invitation', 'team', 'platform-organizations', 'platform-organizations-live', 'platform-credits', 'platform-credits-live']) {
    for (const scenario of scenarios) {
        test(`${configurationName} browser ${scenario.name} preserves secret artifact policy`, { timeout: 60_000 }, () => {
            const directory = mkdtempSync(join(tmpdir(), 'lef-invitation-artifact-guard-'))
            const outputDirectory = join(directory, 'results')
            const configurationFile = join(directory, 'playwright.config.ts')
            const bodyMarker = join(directory, 'body-ran')
            const teardownMarker = join(directory, 'teardown-ran')
            const token = randomBytes(32).toString('base64url')
            const password = randomBytes(24).toString('base64url')
            try {
                writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n', { mode: 0o600 })
                writeFileSync(configurationFile, `
import configuration from ${JSON.stringify(join(webRoot, 'playwright.config.ts'))}
export default {
    ...configuration,
    testDir: ${JSON.stringify(directory)},
    testMatch: 'invitations-ui.spec.ts',
    reporter: ${JSON.stringify(join(webRoot, 'tests/support/invitation-reporter.ts'))},
    outputDir: ${JSON.stringify(outputDirectory)},
    webServer: undefined,
    projects: [{name: 'privacy-regression'}],
}
`, { mode: 0o600 })
                writeFileSync(join(directory, 'invitations-ui.spec.ts'), `
import { writeFileSync } from 'node:fs'
import { test, expect } from ${JSON.stringify(join(webRoot, 'tests/support/privileged-login.ts'))}
${scenario.late ? `
test.afterEach(async ({ page }) => {
    await page.waitForTimeout(50)
    console.log(process.env.INVITATION_TEST_TOKEN)
    process.stderr.write(process.env.INVITATION_TEST_PASSWORD!)
    writeFileSync(${JSON.stringify(teardownMarker)}, 'teardown-ran')
    throw new Error(process.env.INVITATION_TEST_PASSWORD)
})
` : ''}
test('private invitation failure', async ({ page, context }) => {
    const token = process.env.INVITATION_TEST_TOKEN!
    const password = process.env.INVITATION_TEST_PASSWORD!
    await context.route('https://fixture.invalid/**', route => route.fulfill({
        contentType: 'text/html', body: '<title>Invitation</title><input aria-label="Token"><input type="password" aria-label="Password">',
    }))
    await page.goto('https://fixture.invalid/accept-invitation/' + token)
    await page.getByLabel('Token', { exact: true }).fill(token)
    await page.getByLabel('Password', { exact: true }).fill(password)
    page.on('console', message => console.log(message.text()))
    await page.evaluate(({ token, password }) => { console.log(token); console.error(password) }, { token, password })
    console.log(token)
    process.stderr.write(password)
    writeFileSync(${JSON.stringify(bodyMarker)}, 'private-content-ready')
    ${scenario.timeout ? `test.setTimeout(1_000); await new Promise(() => {})`
        : scenario.dom ? `await expect(page.locator('body')).toMatchAriaSnapshot('- heading "deliberately absent"', { timeout: 200 })`
        : `expect(token).toBe(password)`}
})
`, { mode: 0o600 })
                const environment = { ...process.env, LEF_PLAYWRIGHT_SUITE: configurationName, INVITATION_TEST_TOKEN: token, INVITATION_TEST_PASSWORD: password }
                for (const key of ['DEBUG', 'PWDEBUG', 'PW_TEST_DEBUG', 'PW_TEST_REUSE_CONTEXT', 'PWDEBUGIMPL']) delete environment[key]
                const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', `--config=${configurationFile}`], {
                    cwd: webRoot, env: environment, encoding: 'utf8', timeout: 45_000, maxBuffer: 1_000_000,
                })
                assert.equal(Boolean(result.error), false, 'The artifact check must execute Playwright')
                assert.equal(result.status, 1, 'The deliberate browser failure must fail the child test')
                const output = `${result.stdout}\n${result.stderr}`
                assert.equal(/Invitation test at line \d+: FAIL/.test(output), true, 'The dedicated reporter must confirm test execution')
                if (!scenario.timeout) assert.equal(/invitations-ui\.spec\.ts:\d+:\d+/.test(output), true,
                    'Failures retain only an allowlisted source coordinate for diagnosis')
                for (const marker of [token, password]) {
                    assert.equal(output.includes(marker), false, 'Runtime invitation markers must not appear in CLI output')
                }
                assert.equal(existsSync(bodyMarker), true, 'Private browser content must be exercised before the deliberate failure')
                if (scenario.late) assert.equal(existsSync(teardownMarker), true, 'Late failure output must be exercised during teardown')
                // No cleanup or redaction occurs before inspection. Even an empty
                // failure directory or DOM error-context attachment is rejected.
                const files = readdirSync(outputDirectory, { recursive: true }).sort()
                assert.equal(files.length === 1 && files[0] === '.last-run.json', true,
                    'No trace, screenshot, video, attachment, or failure directory may be created')
                for (const file of files) {
                    const contents = readFileSync(join(outputDirectory, file), 'utf8')
                    for (const marker of [token, password]) assert.equal(contents.includes(marker), false, 'Runtime markers must not reach output files')
                }
            } finally {
                rmSync(directory, { recursive: true, force: true })
            }
        })
    }
}
