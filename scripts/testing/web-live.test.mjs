import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { assertFixtureTarget, assertPassedBrowserReport, browserFailureLocations } from './web-live.mjs'
import { assertPrivateTopologyLogs, privacyCases } from './web-log-privacy.mjs'

test('requires six successful live browser tests and rejects empty, skipped, flaky, or failed execution', () => {
    const report = { stats: { expected: 6, unexpected: 0, flaky: 0, skipped: 0 }, errors: [] }
    assert.equal(assertPassedBrowserReport(report), 6)
    for (const change of [{ expected: 0 }, { expected: 5 }, { unexpected: 1 }, { flaky: 1 }, { skipped: 1 }]) {
        assert.throws(() => assertPassedBrowserReport({ ...report, stats: { ...report.stats, ...change } }))
    }
    assert.throws(() => assertPassedBrowserReport({ ...report, errors: [{}] }))
})

test('requires the same-origin gateway and disposable application database before creating a member', () => {
    const metadata = {
        apiUrl: 'http://localhost:53000',
        keycloakUrl: 'http://localhost:58080',
        postgresUrl: 'postgresql://postgres:synthetic@localhost:55432/lef',
    }
    assert.doesNotThrow(() => assertFixtureTarget(metadata))
    for (const change of [
        { apiUrl: 'http://remote:3000' },
        { keycloakUrl: 'http://keycloak:8080' },
        { postgresUrl: 'postgresql://postgres:synthetic@localhost:55432/another' },
    ])
        assert.throws(() => assertFixtureTarget({ ...metadata, ...change }))
})

test('reports browser failure locations without printing assertion values or authentication diagnostics', () => {
    assert.deepEqual(
        browserFailureLocations({
            suites: [
                {
                    specs: [
                        {
                            ok: false,
                            line: 100,
                            tests: [
                                {
                                    results: [
                                        {
                                            errors: [
                                                {
                                                    stack: 'private-token at same-origin.spec.ts:128:9',
                                                    message: 'private-token',
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            ok: false,
                            file: 'auth-shell.spec.ts',
                            line: 42,
                            tests: [{ results: [{ errors: [{ message: 'private-token' }] }] }],
                        },
                    ],
                },
            ],
        }),
        ['same-origin.spec.ts:128', 'auth-shell.spec.ts:42'],
    )
})

function topology() {
    const cases = privacyCases('synthetic-only')
    const requests = cases.requests.map(probe => ({ ...probe, status: probe.ui ? 200 : 401, requestId: randomUUID() }))
    return {
        probes: { markers: cases.markers, requests },
        logs: {
            web: requests
                .map(probe =>
                    JSON.stringify({
                        method: probe.method,
                        path: probe.label,
                        status: probe.status,
                        requestId: 'a'.repeat(32),
                    }),
                )
                .join('\n'),
            api: requests
                .filter(probe => !probe.ui)
                .map(probe =>
                    JSON.stringify({
                        req: { method: probe.method, path: probe.apiLabel ?? probe.label, id: probe.requestId },
                        res: { statusCode: probe.status },
                    }),
                )
                .join('\n'),
        },
    }
}

test('requires fixed labels, methods, statuses, and safe correlation in both independent log boundaries', () => {
    const { logs, probes } = topology()
    assert.doesNotThrow(() => assertPrivateTopologyLogs(logs, probes))
    for (const boundary of ['web', 'api']) {
        assert.throws(() => assertPrivateTopologyLogs({ ...logs, [boundary]: '' }, probes))
        const records = logs[boundary].split('\n').map(JSON.parse)
        for (const mutate of [
            record => {
                if (boundary === 'web') record.path = '/wrong'
                else record.req.path = '/wrong'
            },
            record => {
                if (boundary === 'web') record.method = 'OTHER'
                else record.req.method = 'OTHER'
            },
            record => {
                if (boundary === 'web') record.status = 599
                else record.res.statusCode = 599
            },
            record => {
                if (boundary === 'web') record.requestId = 'untrusted'
                else record.req.id = 'untrusted'
            },
        ]) {
            const changed = structuredClone(records)
            changed.forEach(mutate)
            assert.throws(() =>
                assertPrivateTopologyLogs(
                    { ...logs, [boundary]: changed.map(record => JSON.stringify(record)).join('\n') },
                    probes,
                ),
            )
        }
    }
})

test('detects every sensitive marker in stdout or non-JSON error text without reproducing it in diagnostics', () => {
    const { logs, probes } = topology()
    assert.equal(probes.markers.length, 9)
    for (const boundary of ['web', 'api']) {
        for (const marker of probes.markers) {
            assert.throws(
                () => assertPrivateTopologyLogs({ ...logs, [boundary]: `${logs[boundary]}\nerror ${marker}` }, probes),
                error => {
                    assert.ok(!error.message.includes(marker))
                    return true
                },
            )
        }
    }
})
