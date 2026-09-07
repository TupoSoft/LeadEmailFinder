import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'
import {
    brunoFailure,
    composeFailureOutput,
    failureDiagnostic,
    formatFailureDiagnostic,
    parseComposeFailure,
    reportFailureDiagnostic,
} from './failure-diagnostic.mjs'
import { composeWorker } from './run-collection.mjs'

const execFileAsync = promisify(execFile)
const checkoutRoot = fileURLToPath(new URL('../../', import.meta.url))
const privateValue = 'synthetic-private-token-cookie-url-body'

test('diagnostics allow only closed stages and bounded integer facts', () => {
    for (const stage of ['fixture_bootstrap', 'collection', 'report', 'balance_restore']) {
        assert.deepEqual(failureDiagnostic(brunoFailure({ stage })), { stage })
    }
    const diagnostic = { stage: 'collection', request: 2, status: 403, requests: 15, tests: 15 }
    assert.deepEqual(failureDiagnostic(brunoFailure(diagnostic)), diagnostic)
    for (const invalid of [
        { stage: privateValue },
        { ...diagnostic, message: privateValue },
        { ...diagnostic, request: 0 },
        { ...diagnostic, request: 10_001 },
        { ...diagnostic, status: 99 },
        { ...diagnostic, status: 600 },
        { ...diagnostic, status: '403' },
        { ...diagnostic, requests: -1 },
        { ...diagnostic, requests: 10_001 },
        { ...diagnostic, tests: 100_001 },
        { ...diagnostic, tests: 1.5 },
        { ...diagnostic, tests: NaN },
        { ...diagnostic, tests: Infinity },
    ]) {
        assert.deepEqual(failureDiagnostic(brunoFailure(invalid)), { stage: 'collection' })
        assert.ok(!formatFailureDiagnostic(brunoFailure(invalid)).includes(privateValue))
    }
    const untrusted = Object.assign(new Error(privateValue), { diagnostic })
    assert.deepEqual(failureDiagnostic(untrusted), { stage: 'fixture_bootstrap' })
    assert.equal(formatFailureDiagnostic(untrusted), '{"stage":"fixture_bootstrap"}')
})

test('report diagnostics omit all supplied strings and use numeric report position', () => {
    const passing = { testResults: [{ status: 'pass' }] }
    const report = [
        {
            name: privateValue,
            summary: { totalRequests: 15, totalTests: 15, error: privateValue },
            results: [
                passing,
                {
                    name: privateValue,
                    test: { filename: privateValue },
                    request: { url: privateValue, headers: { authorization: privateValue }, data: privateValue },
                    response: {
                        status: 403,
                        statusText: privateValue,
                        data: privateValue,
                        headers: { cookie: privateValue },
                    },
                    error: privateValue,
                    testResults: [{ status: 'fail', error: privateValue }],
                },
            ],
        },
    ]
    assert.deepEqual(reportFailureDiagnostic(report, 'collection'), {
        stage: 'collection',
        request: 2,
        status: 403,
        requests: 15,
        tests: 15,
    })
    for (const field of ['assertionResults', 'preRequestTestResults', 'postResponseTestResults']) {
        assert.equal(
            reportFailureDiagnostic(
                [
                    {
                        results: [
                            passing,
                            {
                                ...passing,
                                [field]: [{ status: 'fail', message: privateValue }],
                            },
                        ],
                    },
                ],
                'report',
            ).request,
            2,
        )
    }
    for (const status of [privateValue, '403', -1, 1.5, 600]) {
        report[0].results[1].response.status = status
        assert.equal(reportFailureDiagnostic(report, 'collection').status, undefined)
    }
    assert.ok(!JSON.stringify(reportFailureDiagnostic(report, 'collection')).includes(privateValue))
})

test('missing and invalid reports produce bounded diagnostics without accepting zero execution', () => {
    for (const report of [undefined, null, {}, privateValue, [], [{}, {}]]) {
        assert.deepEqual(reportFailureDiagnostic(report, 'report'), { stage: 'report' })
    }
    assert.deepEqual(
        reportFailureDiagnostic([{ summary: { totalRequests: 0, totalTests: 0 }, results: [] }], 'report'),
        {
            stage: 'report',
            requests: 0,
            tests: 0,
        },
    )
    assert.deepEqual(
        reportFailureDiagnostic(
            [
                {
                    summary: { totalRequests: privateValue, totalTests: 100_001 },
                    results: [{ skipped: true, response: { status: 200 } }],
                },
            ],
            'report',
        ),
        { stage: 'report', request: 1, status: 200 },
    )
})

test('Compose failure envelopes are validated again and never pass through raw child output', () => {
    const diagnostic = { stage: 'report', request: 4, status: 401, requests: 15, tests: 14 }
    const output = composeFailureOutput(brunoFailure(diagnostic))
    assert.deepEqual(failureDiagnostic(parseComposeFailure(output)), diagnostic)
    for (const raw of [
        undefined,
        privateValue,
        '{}',
        'null',
        privateValue.repeat(200),
        JSON.stringify({ diagnostic: { stage: privateValue } }),
        JSON.stringify({ diagnostic: { ...diagnostic, request: privateValue } }),
        JSON.stringify({ diagnostic, stdout: privateValue }),
        JSON.stringify({ diagnostic: { ...diagnostic, message: privateValue } }),
        `${output}\n${privateValue}`,
    ]) {
        assert.deepEqual(failureDiagnostic(parseComposeFailure(raw)), { stage: 'collection' })
        assert.ok(!formatFailureDiagnostic(parseComposeFailure(raw)).includes(privateValue))
    }
    assert.equal(composeFailureOutput(new Error(privateValue)), '{"diagnostic":{"stage":"collection"}}')
})

test('Compose worker and outer CLI suppress malicious synthetic child input', async () => {
    const command = execFileAsync(process.execPath, ['--input-type=module', '-e', composeWorker], {
        cwd: checkoutRoot,
        timeout: 10_000,
    })
    command.child.stdin.end(JSON.stringify({ name: privateValue, environment: { SECRET: privateValue } }))
    await assert.rejects(command, error => {
        assert.equal(error.code, 1)
        assert.deepEqual(failureDiagnostic(parseComposeFailure(error.stdout)), { stage: 'collection' })
        assert.doesNotMatch(error.stdout + error.stderr, /synthetic-private/)
        assert.match(error.stderr, /raw output is withheld/)
        return true
    })
    await assert.rejects(
        execFileAsync(process.execPath, ['scripts/bruno/run-collection.mjs', privateValue], {
            cwd: checkoutRoot,
            timeout: 10_000,
        }),
        error => {
            assert.equal(error.code, 1)
            assert.match(error.stderr, /"stage":"fixture_bootstrap"/)
            assert.match(error.stderr, /raw output is withheld/)
            assert.doesNotMatch(error.stdout + error.stderr, /synthetic-private/)
            return true
        },
    )
})
