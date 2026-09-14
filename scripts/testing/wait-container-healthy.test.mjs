import assert from 'node:assert/strict'
import { execFile, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import { promisify } from 'node:util'
import {
    INSPECT_FORMAT,
    inspectContainer,
    parseTimeoutSeconds,
    waitForContainerHealthy,
} from './wait-container-healthy.mjs'

const container = 'lef-keycloak-1'
const helper = resolve(import.meta.dirname, 'wait-container-healthy.mjs')
const runFile = promisify(execFile)

async function fakeWait({ timeoutSeconds = 300, inspect = () => ({ status: 'starting' }) } = {}) {
    let clock = 42_000
    const started = clock
    const inspections = []
    const sleeps = []
    const result = await waitForContainerHealthy({
        container,
        timeoutSeconds,
        now: () => clock,
        sleep: async milliseconds => {
            sleeps.push(milliseconds)
            clock += milliseconds
        },
        inspect: async (name, milliseconds) => {
            assert.equal(name, container)
            const elapsedMs = clock - started
            inspections.push({ elapsedMs, timeoutMs: milliseconds })
            const response = inspect({ elapsedMs, timeoutMs: milliseconds, attempt: inspections.length })
            clock += response.durationMs ?? 0
            if (response.error) throw response.error
            return response.status
        },
    })
    return { result, inspections, sleeps }
}

function syntheticDocker(t, source) {
    const directory = mkdtempSync(resolve(tmpdir(), 'lef-health-test-'))
    const executable = resolve(directory, 'docker')
    writeFileSync(executable, `#!${process.execPath}\n${source}\n`, { mode: 0o700 })
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    return { directory, executable }
}

test('timeout parser accepts canonical decimal seconds at both bounds', () => {
    for (const seconds of ['1', '2', '120', '300', '599', '600']) {
        assert.equal(parseTimeoutSeconds(seconds), Number(seconds))
    }
})

test('timeout parser rejects empty, noncanonical, out-of-range, and nonstring inputs', () => {
    for (const invalid of [
        '',
        '0',
        '-1',
        '+1',
        '01',
        '001',
        ' 1',
        '1 ',
        '\t1',
        '1\n',
        '300\r\n',
        '300\u2028',
        '1.0',
        '1.5',
        '1e2',
        '0x10',
        '601',
        '999',
        '1000',
        'NaN',
        'Infinity',
        'invalid-secret',
        undefined,
        null,
        300,
    ]) {
        assert.throws(() => parseTimeoutSeconds(invalid), {
            message: 'Timeout must be a decimal integer from 1 through 600 without leading zeros.',
        })
    }
})

test('validation CLI succeeds without Docker or output', () => {
    const result = spawnSync(process.execPath, [helper, '--validate-timeout', '300'], {
        encoding: 'utf8',
        env: { ...process.env, PATH: '/nonexistent-health-test-bin' },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, '')
    assert.equal(result.stderr, '')
})

test('CLI rejects invalid timeout, name, and argument count without exposing input', () => {
    for (const args of [
        ['--validate-timeout', ''],
        ['--validate-timeout', '01'],
        ['--validate-timeout', '601'],
        ['--validate-timeout', 'invalid-secret'],
        ['--validate-timeout', '300\n'],
        ['--validate-timeout', '300\r\n'],
        ['--validate-timeout'],
        [container, '0'],
        [container, '300', 'extra-secret'],
        ['unsafe\nsecret', '1'],
        [`${container}\n`, '1'],
        [`${container}\r\n`, '1'],
        ['--help'],
        [],
    ]) {
        const result = spawnSync(process.execPath, [helper, ...args], {
            encoding: 'utf8',
            env: { ...process.env, PATH: '/nonexistent-health-test-bin' },
        })
        assert.equal(result.status, 1)
        assert.equal(result.stdout, '')
        assert.doesNotMatch(result.stderr, /secret|inspect-unavailable/)
    }
})

test('health after 120 seconds succeeds with 300 seconds and fails with 120 seconds', async () => {
    const inspect = ({ elapsedMs }) => ({ status: elapsedMs >= 122_000 ? 'healthy' : 'starting' })
    const allowed = await fakeWait({ timeoutSeconds: 300, inspect })
    assert.equal(allowed.result.outcome, 'healthy')
    assert.equal(allowed.result.elapsedMs, 122_000)
    const shorter = await fakeWait({ timeoutSeconds: 120, inspect })
    assert.equal(shorter.result.outcome, 'timeout')
    assert.equal(shorter.result.elapsedMs, 120_000)
    assert.equal(shorter.result.status, 'starting')
})

test('exited and restarting containers can recover before the deadline', async () => {
    const { result, inspections } = await fakeWait({
        timeoutSeconds: 5,
        inspect: ({ attempt }) => ({ status: ['exited', 'restarting', 'healthy'][attempt - 1] }),
    })
    assert.equal(result.outcome, 'healthy')
    assert.equal(result.elapsedMs, 4_000)
    assert.equal(inspections.length, 3)
})

for (const status of [
    'starting',
    'unhealthy',
    'exited',
    'restarting',
    'created',
    'paused',
    'removing',
    'no-healthcheck',
    'inspect-unavailable',
    'inspect-failed',
    'inspect-malformed',
    'inspect-timeout',
    'inspect-output-limit',
]) {
    test(`${status} retries within one deadline and clips the final sleep`, async () => {
        const { result, inspections, sleeps } = await fakeWait({
            timeoutSeconds: 5,
            inspect: () => ({ status }),
        })
        assert.equal(result.outcome, 'timeout')
        assert.equal(result.status, status)
        assert.equal(result.elapsedMs, 5_000)
        assert.deepEqual(inspections, [
            { elapsedMs: 0, timeoutMs: 5_000 },
            { elapsedMs: 2_000, timeoutMs: 3_000 },
            { elapsedMs: 4_000, timeoutMs: 1_000 },
        ])
        assert.deepEqual(sleeps, [2_000, 2_000, 1_000])
    })
}

test('dead containers fail immediately', async () => {
    const { result, inspections, sleeps } = await fakeWait({
        inspect: () => ({ status: 'dead', durationMs: 300 }),
    })
    assert.equal(result.outcome, 'dead')
    assert.equal(result.elapsedMs, 300)
    assert.equal(inspections.length, 1)
    assert.deepEqual(sleeps, [])
})

test('inspection time consumes the deadline and each child gets at most five seconds', async () => {
    const { result, inspections, sleeps } = await fakeWait({
        timeoutSeconds: 12,
        inspect: () => ({ status: 'starting', durationMs: 4_000 }),
    })
    assert.equal(result.outcome, 'timeout')
    assert.equal(result.elapsedMs, 12_000)
    assert.deepEqual(inspections, [
        { elapsedMs: 0, timeoutMs: 5_000 },
        { elapsedMs: 6_000, timeoutMs: 5_000 },
    ])
    assert.deepEqual(sleeps, [2_000, 2_000])
})

test('a stalled inspection uses only the remaining budget', async () => {
    const { result, inspections, sleeps } = await fakeWait({
        timeoutSeconds: 8,
        inspect: ({ timeoutMs }) => ({ status: 'inspect-timeout', durationMs: timeoutMs }),
    })
    assert.equal(result.outcome, 'timeout')
    assert.equal(result.elapsedMs, 8_000)
    assert.deepEqual(inspections, [
        { elapsedMs: 0, timeoutMs: 5_000 },
        { elapsedMs: 7_000, timeoutMs: 1_000 },
    ])
    assert.deepEqual(sleeps, [2_000])
})

for (const durationMs of [1_000, 1_200]) {
    test(`a healthy inspection at ${durationMs}ms cannot rescue a one-second timeout`, async () => {
        const { result, sleeps } = await fakeWait({
            timeoutSeconds: 1,
            inspect: () => ({ status: 'healthy', durationMs }),
        })
        assert.equal(result.outcome, 'timeout')
        assert.equal(result.elapsedMs, durationMs)
        assert.deepEqual(sleeps, [])
    })
}

test('health immediately before the deadline succeeds', async () => {
    const { result } = await fakeWait({
        timeoutSeconds: 1,
        inspect: () => ({ status: 'healthy', durationMs: 999 }),
    })
    assert.equal(result.outcome, 'healthy')
    assert.equal(result.elapsedMs, 999)
})

test('thrown inspection errors and unexpected statuses are sanitized and retried', async () => {
    const { result, inspections } = await fakeWait({
        timeoutSeconds: 5,
        inspect: ({ attempt }) =>
            attempt === 1 ? { error: new Error('private-error-secret') } : { status: 'private-output-secret' },
    })
    assert.equal(result.outcome, 'timeout')
    assert.equal(result.status, 'inspect-malformed')
    assert.equal(inspections.length, 3)
    assert.doesNotMatch(JSON.stringify(result), /private|secret/)
})

test('adapter requests only the lifecycle and health projection', async t => {
    const { directory, executable } = syntheticDocker(
        t,
        `
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./arguments.json', import.meta.url), JSON.stringify(process.argv.slice(2)));
process.stdout.write('running\\thealthy\\n');
process.stderr.write('private stderr ignored');
`,
    )
    assert.equal(await inspectContainer(container, 1_000, { executable }), 'healthy')
    assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'arguments.json'), 'utf8')), [
        'inspect',
        '--format',
        INSPECT_FORMAT,
        '--',
        container,
    ])
    assert.doesNotMatch(INSPECT_FORMAT, /Config|Env|Log|json/)
})

for (const [output, expected] of [
    ['running\tstarting\n', 'starting'],
    ['running\tunhealthy\n', 'unhealthy'],
    ['running\tnone\n', 'no-healthcheck'],
    ['exited\thealthy\n', 'exited'],
    ['restarting\thealthy\n', 'restarting'],
    ['dead\tunhealthy\n', 'dead'],
    ['running\thealthy\r\n', 'healthy'],
    ['healthy\n', 'inspect-malformed'],
    ['running\tprivate-secret\n', 'inspect-malformed'],
    ['private-secret\thealthy\n', 'inspect-malformed'],
    ['running\thealthy\nprivate-secret', 'inspect-malformed'],
    ['', 'inspect-malformed'],
]) {
    test(`adapter normalizes ${JSON.stringify(output)} to ${expected}`, async t => {
        const { executable } = syntheticDocker(t, `process.stdout.write(${JSON.stringify(output)});`)
        assert.equal(await inspectContainer(container, 1_000, { executable }), expected)
    })
}

test('adapter sanitizes missing executable and failed inspection errors', async t => {
    const { directory, executable } = syntheticDocker(
        t,
        `
process.stdout.write('private stdout secret');
process.stderr.write('No such object: private stderr secret');
process.exitCode = 1;
`,
    )
    assert.equal(await inspectContainer(container, 1_000, { executable }), 'inspect-failed')
    assert.equal(
        await inspectContainer(container, 1_000, {
            executable: resolve(directory, 'missing-private-secret'),
        }),
        'inspect-unavailable',
    )
})

for (const stream of ['stdout', 'stderr']) {
    test(`adapter bounds ${stream} and kills excessive output`, async t => {
        const { executable } = syntheticDocker(
            t,
            `
process.on('SIGTERM', () => {});
process.${stream}.write('private-secret'.repeat(10_000));
setInterval(() => {}, 1_000);
`,
        )
        const started = performance.now()
        assert.equal(await inspectContainer(container, 1_000, { executable }), 'inspect-output-limit')
        assert.ok(performance.now() - started < 2_000)
    })
}

test('adapter force-kills a stalled executable even when it ignores SIGTERM', async t => {
    const { directory, executable } = syntheticDocker(
        t,
        `
import { writeFileSync } from 'node:fs';
process.on('SIGTERM', () => {});
writeFileSync(new URL('./pid', import.meta.url), String(process.pid));
setInterval(() => {}, 1_000);
`,
    )
    const started = performance.now()
    assert.equal(await inspectContainer(container, 1_000, { executable }), 'inspect-timeout')
    assert.ok(performance.now() - started < 2_000, 'termination must stay within one second of the inspection budget')
    const pid = Number(readFileSync(resolve(directory, 'pid'), 'utf8'))
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})

test('adapter does not start an inspection when no time remains', async t => {
    const { executable } = syntheticDocker(t, 'process.stdout.write("running\\thealthy\\n");')
    for (const timeoutMs of [0, -1, 0.5, NaN]) {
        assert.equal(await inspectContainer(container, timeoutMs, { executable }), 'inspect-timeout')
    }
})

test('CLI emits only normalized readiness details for malformed Docker output', async t => {
    const { directory } = syntheticDocker(
        t,
        `
process.stdout.write('private stdout secret');
process.stderr.write('private stderr secret');
`,
    )
    await assert.rejects(
        runFile(process.execPath, [helper, container, '1'], {
            encoding: 'utf8',
            env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
            timeout: 3_000,
        }),
        error => {
            assert.equal(error.code, 1)
            assert.equal(error.stdout, '')
            assert.match(
                error.stderr,
                /^Container lef-keycloak-1: budget=1s elapsed=\d+\.\d{3}s status=inspect-malformed outcome=timeout\n$/,
            )
            assert.doesNotMatch(error.stderr, /private|secret/)
            return true
        },
    )
})

test('CLI exits successfully for a healthy container', async t => {
    const { directory } = syntheticDocker(t, 'process.stdout.write("running\\thealthy\\n");')
    const result = await runFile(process.execPath, [helper, container, '300'], {
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        timeout: 3_000,
    })
    assert.match(
        result.stdout,
        /^Container lef-keycloak-1: budget=300s elapsed=\d+\.\d{3}s status=healthy outcome=healthy\n$/,
    )
    assert.equal(result.stderr, '')
})
