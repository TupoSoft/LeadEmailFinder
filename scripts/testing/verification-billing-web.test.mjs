import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Reporter, { assertVerificationBillingReport, runVerificationBillingWeb } from './verification-billing-web.mjs'

const passing = { status: 'passed', total: 3, passed: 3, failed: 0, skipped: 0, errors: 0, locations: [] }

test('live evidence rejects skipped, empty, partial, failed, and retry-inflated runs', () => {
    assert.equal(assertVerificationBillingReport(passing), 3)
    for (const report of [
        undefined,
        {},
        { ...passing, total: 0, passed: 0 },
        { ...passing, skipped: 1 },
        { ...passing, passed: 2 },
        { ...passing, failed: 1 },
        { ...passing, errors: 1 },
        { ...passing, passed: 4 },
        { ...passing, status: 'failed' },
    ]) {
        assert.throws(() => assertVerificationBillingReport(report))
    }
})

test('reporter stores only scalar counts, never assertion or credential diagnostics', () => {
    const directory = mkdtempSync(join(tmpdir(), 'lef-billing-reporter-'))
    try {
        const path = join(directory, 'counts.json')
        const reporter = new Reporter({ path })
        reporter.onBegin({}, { allTests: () => [1, 2, 3] })
        for (let index = 0; index < 3; index++) reporter.onTestEnd({ title: 'private@lef.test' }, { status: 'passed' })
        reporter.onStdErr('Bearer private-credential')
        reporter.onEnd({ status: 'passed', message: 'private@lef.test' })
        assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), passing)
        reporter.onTestEnd({}, { status: 'skipped' })
        assert.deepEqual(reporter.onEnd({ status: 'passed' }), { status: 'failed' })
        reporter.onTestEnd(
            {},
            {
                status: 'failed',
                errors: [
                    { stack: 'private@lef.test Bearer private-credential\n at verification-billing.spec.ts:30:4' },
                ],
            },
        )
        reporter.onError(new Error('private-credential'))
        reporter.onEnd({ status: 'failed' })
        const report = readFileSync(path, 'utf8')
        assert.equal(report.includes('private'), false)
        assert.deepEqual(JSON.parse(report).locations, ['verification-billing.spec.ts:30:4'])
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
})

test('runner verifies ownership before bootstrap, forces privacy, validates counts, and removes artifacts', () => {
    const calls = []
    let reportPath
    const count = runVerificationBillingWeb({
        root: '/synthetic/checkout',
        environment: { DEBUG: '*', PWDEBUG: '1', PW_TEST_DEBUG: '1' },
        loadStack: () => {
            calls.push('owned')
            return {}
        },
        inspect: (_root, _stack, service) => calls.push(service),
        run: (_program, args, options) => {
            assert.equal(calls[0], 'owned')
            assert.equal(options.env.DEBUG, undefined)
            assert.equal(options.env.PWDEBUG, undefined)
            assert.equal(options.env.PW_TEST_DEBUG, undefined)
            assert.equal(options.env.PLAYWRIGHT_NO_COPY_PROMPT, '1')
            assert.equal(options.env.LEF_PLAYWRIGHT_SUITE, 'verification-billing')
            reportPath = options.env.VERIFICATION_BILLING_REPORT
            calls.push(args.at(-1))
            if (args.includes('playwright')) writeFileSync(reportPath, JSON.stringify(passing))
            return { status: 0, stdout: 'private@lef.test', stderr: 'Bearer private' }
        },
    })
    assert.equal(count, 3)
    assert.equal(existsSync(reportPath), false)
    assert.deepEqual(calls.slice(-2), [
        'tests/support/bootstrap-browser-fixtures.ts',
        '--config=playwright.config.ts',
    ])
})

test('runner withholds raw errors and refuses success without a complete report', () => {
    for (const kind of ['ownership', 'bootstrap', 'empty', 'skipped']) {
        let executions = 0
        assert.throws(
            () =>
                runVerificationBillingWeb({
                    loadStack: () => {
                        if (kind === 'ownership') throw new Error('private@lef.test')
                        return {}
                    },
                    inspect: () => undefined,
                    run: (_program, args, options) => {
                        executions++
                        if (kind === 'bootstrap') return { status: 1, stderr: 'Bearer private-token' }
                        if (kind === 'skipped' && args.includes('playwright')) {
                            writeFileSync(
                                options.env.VERIFICATION_BILLING_REPORT,
                                JSON.stringify({ ...passing, skipped: 1 }),
                            )
                        }
                        return { status: 0 }
                    },
                }),
            error => !error.message.includes('private') && error.message.includes('withheld'),
        )
        if (kind === 'ownership') assert.equal(executions, 0)
        if (kind === 'bootstrap') assert.equal(executions, 1)
    }
})
