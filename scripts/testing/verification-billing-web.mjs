import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectDevelopmentService, loadDevelopmentStack } from './development-stack.mjs'

const expectedTests = 3
const failure = 'Verification billing browser validation failed; credentials, addresses, and child output withheld.'

export function assertVerificationBillingReport(report) {
    if (
        report?.status !== 'passed' ||
        report.total !== expectedTests ||
        report.passed !== expectedTests ||
        report.failed !== 0 ||
        report.skipped !== 0 ||
        report.errors !== 0
    ) {
        throw new Error('Verification billing requires exactly three passing live tests with no skips or errors.')
    }
    return report.passed
}

// The live reporter persists counts only: assertion bodies, URLs, identities, and credentials never enter reports.
export default class VerificationBillingReporter {
    report = { total: 0, passed: 0, failed: 0, skipped: 0, errors: 0, locations: [] }
    constructor(options = {}) {
        this.path = options.path ?? process.env.VERIFICATION_BILLING_REPORT
    }
    onBegin(_config, suite) {
        this.report.total = suite.allTests().length
    }
    onTestEnd(_test, result) {
        if (result.status === 'passed') this.report.passed++
        else if (result.status === 'skipped') this.report.skipped++
        else {
            this.report.failed++
            for (const error of result.errors ?? []) {
                const location = error.stack?.match(/verification-billing\.spec\.ts:\d+:\d+/)?.[0]
                if (location) this.report.locations.push(location)
            }
        }
        if (this.path) writeFileSync(this.path, JSON.stringify({ ...this.report, status: 'running' }), { mode: 0o600 })
    }
    onError() {
        this.report.errors++
    }
    onStdOut() {}
    onStdErr() {}
    onEnd(result) {
        const report = { ...this.report, status: result.status }
        if (this.path) writeFileSync(this.path, JSON.stringify(report), { mode: 0o600 })
        try {
            assertVerificationBillingReport(report)
        } catch {
            return { status: 'failed' }
        }
    }
}

export function runVerificationBillingWeb({
    root = resolve(fileURLToPath(new URL('../../', import.meta.url))),
    run = spawnSync,
    loadStack = loadDevelopmentStack,
    inspect = inspectDevelopmentService,
    environment = process.env,
} = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'lef-verification-billing-web-'))
    let stage = 'owned stack'
    let locations = []
    try {
        const stack = loadStack(root, { persistMetadata: false })
        for (const service of ['api', 'web', 'smtp-evidence', 'plaintext-mailpit', 'coredns', 'smtp-dev-proxy']) {
            inspect(root, stack, service)
        }
        const env = {
            ...environment,
            COMPOSE_PROJECT_NAME: stack.composeProject,
            LEF_PLAYWRIGHT_SUITE: 'verification-billing',
            PLAYWRIGHT_NO_COPY_PROMPT: '1',
            LEF_VERIFICATION_TEST_PRIVACY: '1',
            BROWSER_FIXTURE_OUTPUT: join(directory, 'results'),
            VERIFICATION_BILLING_REPORT: join(directory, 'counts.json'),
        }
        for (const name of ['DEBUG', 'PWDEBUG', 'PW_TEST_DEBUG', 'PW_TEST_REUSE_CONTEXT', 'PWDEBUGIMPL'])
            delete env[name]
        for (const [program, args, timeout] of [
            [
                process.execPath,
                [
                    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
                    '--experimental-strip-types',
                    'tests/support/bootstrap-browser-fixtures.ts',
                ],
                180_000,
            ],
            [
                'corepack',
                ['pnpm', 'exec', 'playwright', 'test', '--config=playwright.config.ts'],
                420_000,
            ],
        ]) {
            stage = args.includes('playwright') ? 'browser tests' : 'MFA bootstrap'
            const result = run(program, args, {
                cwd: join(root, 'apps/web'),
                env,
                encoding: 'utf8',
                timeout,
                maxBuffer: 2 * 1024 * 1024,
            })
            if (result.error || result.status !== 0) {
                try {
                    const report = JSON.parse(readFileSync(env.VERIFICATION_BILLING_REPORT, 'utf8'))
                    locations = Array.isArray(report.locations)
                        ? report.locations.filter(
                              value =>
                                  typeof value === 'string' && /^verification-billing\.spec\.ts:\d+:\d+$/.test(value),
                          )
                        : []
                } catch {
                    /* Missing reports still fail without forwarding child diagnostics. */
                }
                throw new Error(failure)
            }
        }
        stage = 'result counts'
        return assertVerificationBillingReport(JSON.parse(readFileSync(env.VERIFICATION_BILLING_REPORT, 'utf8')))
    } catch {
        throw new Error(`${failure} Stage: ${stage}.${locations.length ? ` Locations: ${locations.join(', ')}.` : ''}`)
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const count = runVerificationBillingWeb()
        process.stdout.write(`Verification billing: ${count} live browser tests passed.\n`)
    } catch (error) {
        process.stderr.write(
            `${error instanceof Error && error.message.startsWith(failure) ? error.message : failure}\n`,
        )
        process.exitCode = 1
    }
}
