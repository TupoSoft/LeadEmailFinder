import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

export const SERVICES = Object.freeze([
    'keycloak', 'api', 'keycloak-postgres', 'postgres', 'redis', 'garage', 'web', 'bullboard',
])
const STATES = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead', 'unknown']
const HEALTH = ['starting', 'healthy', 'unhealthy', 'none', 'unknown']
const REASONS = ['timeout', 'output-limit', 'command-failed', 'invalid-data']
const MARKERS = {
    'connection-refused': 'ECONNREFUSED',
    'connection-timeout': 'ETIMEDOUT',
    'name-resolution': 'ENOTFOUND',
    'memory-error': 'OutOfMemoryError',
    'database-retry': 'Unable to connect to the database',
    'startup-failed': 'Failed to start server',
}
const MAX_BUFFER = 65_536
const MAX_OUTPUT = 32_768
const COMMAND_BUDGET = 5_000
const COLLECTION_BUDGET = 45_000
const EMISSION_RESERVE = 250

// Never request whole inspection objects: probe output, health commands, environment and errors stay in Docker.
const INSPECTION_FORMAT = '{' +
    '"project":{{json (index .Config.Labels "com.docker.compose.project")}},' +
    '"service":{{json (index .Config.Labels "com.docker.compose.service")}},' +
    '"workingDir":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},' +
    '"configFiles":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},' +
    '"state":{"status":{{json .State.Status}},"oomKilled":{{json .State.OOMKilled}},"exitCode":{{json .State.ExitCode}}},' +
    '"restartCount":{{json .RestartCount}},' +
    '"health":{{if .State.Health}}{"status":{{json .State.Health.Status}},"failingStreak":{{json .State.Health.FailingStreak}},' +
    '"probes":[{{$comma := ""}}{{range $i, $probe := .State.Health.Log}}{{if le (len (slice $.State.Health.Log $i)) 5}}' +
    '{{$comma}}{"start":{{json $probe.Start}},"end":{{json $probe.End}},"exitCode":{{json $probe.ExitCode}}}' +
    '{{$comma = ","}}{{end}}{{end}}]}{{else}}null{{end}}}'

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const isInteger = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum
const unavailable = reason => ({ result: 'unavailable', reason, state: 'unknown', health: 'unknown' })
const uncollected = result => ({ result, state: 'unknown', health: 'unknown' })

function timestamp(value) {
    // Docker uses RFC 3339 timestamps. Do not coerce numbers, arbitrary strings, or its unset year-one sentinel.
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return
    const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`)
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) return
    if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return
    const milliseconds = Date.parse(value)
    if (Number.isSafeInteger(milliseconds) && milliseconds >= 0) return milliseconds
}

/** Project untrusted inspection data into closed enums and bounded numeric facts. */
export function projectInspection(value, service, checkoutRoot) {
    if (!isObject(value) || !['project', 'service', 'workingDir', 'configFiles'].every(key => typeof value[key] === 'string')) {
        return unavailable('invalid-data')
    }
    if (
        value.project !== 'lef' || value.service !== service ||
        ![checkoutRoot, resolve(checkoutRoot, 'docker')].includes(value.workingDir) ||
        value.configFiles !== resolve(checkoutRoot, 'docker/compose.yaml')
    ) return uncollected('foreign')
    if (
        !isObject(value.state) || typeof value.state.status !== 'string' ||
        (value.health !== null && (!isObject(value.health) || typeof value.health.status !== 'string'))
    ) return unavailable('invalid-data')

    const record = {
        result: 'collected',
        state: STATES.includes(value.state.status) ? value.state.status : 'unknown',
        health: value.health === null ? 'none' : HEALTH.includes(value.health.status) ? value.health.status : 'unknown',
    }
    if (typeof value.state.oomKilled === 'boolean') record.oomKilled = value.state.oomKilled
    if (isInteger(value.state.exitCode, -1, 255)) record.exitCode = value.state.exitCode
    if (isInteger(value.restartCount, 0, 1_000_000)) record.restartCount = value.restartCount
    if (isInteger(value.health?.failingStreak, 0, 1_000_000)) record.failingStreak = value.health.failingStreak
    if (Array.isArray(value.health?.probes)) {
        record.probes = value.health.probes.slice(-5).filter(isObject).map(probe => {
            const projected = {}
            for (const field of ['start', 'end']) {
                const milliseconds = timestamp(probe[field])
                if (milliseconds !== undefined) projected[field] = milliseconds
            }
            if (isInteger(probe.exitCode, -1, 255)) projected.exitCode = probe.exitCode
            return projected
        })
    }
    return record
}

export function summarizeStartupLogs(text) {
    const lines = text.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    const sample = lines.slice(-200)
    return {
        sampledLines: sample.length,
        markers: Object.fromEntries(Object.entries(MARKERS).map(([label, marker]) => [
            label, sample.filter(line => line.includes(marker)).length,
        ])),
    }
}

/** The only infrastructure adapter; child streams and error messages never reach the caller. */
export function runDockerCommand(args, { cwd, timeout, maxBuffer }) {
    return new Promise(resolveCommand => {
        let capturedBytes = 0
        let outputLimited = false
        const child = execFile('docker', args, { cwd, timeout, maxBuffer, encoding: 'buffer', killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
            if (error || outputLimited) {
                const reason = outputLimited || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'output-limit'
                    : error.killed && error.signal === 'SIGKILL' ? 'timeout' : 'command-failed'
                resolveCommand({ ok: false, reason })
                return
            }
            // Docker writes a container's stderr logs to its own stderr, even on a successful read.
            const output = args[0] === 'logs'
                ? Buffer.concat([stdout, stdout.length && stderr.length && stdout.at(-1) !== 10 ? Buffer.from('\n') : Buffer.alloc(0), stderr])
                : stdout
            resolveCommand(output.length > maxBuffer
                ? { ok: false, reason: 'output-limit' }
                : { ok: true, stdout: output.toString('utf8') })
        })
        // maxBuffer applies per stream; share a budget so stderr cannot double the capture allowance.
        const trackOutput = chunk => {
            capturedBytes += chunk.length
            if (capturedBytes > maxBuffer) {
                outputLimited = true
                child.kill('SIGKILL')
            }
        }
        child.stdout.on('data', trackOutput)
        child.stderr.on('data', trackOutput)
    })
}

function envelope(services) {
    return {
        schemaVersion: 1,
        collectionStatus: Object.values(services).every(record => record.result === 'collected' && !record.reason) ? 'complete' : 'partial',
        services,
    }
}

export async function collectDiagnostics({ checkoutRoot, runCommand = runDockerCommand, now = () => performance.now() }) {
    const deadline = now() + COLLECTION_BUDGET - EMISSION_RESERVE
    async function command(args) {
        const remaining = Math.floor(deadline - now())
        if (remaining < 1) return { ok: false, reason: 'timeout' }
        try {
            const result = await runCommand(args, { cwd: checkoutRoot, timeout: Math.min(COMMAND_BUDGET, remaining), maxBuffer: MAX_BUFFER })
            if (now() > deadline) return { ok: false, reason: 'timeout' }
            if (result?.ok === false) return { ok: false, reason: REASONS.includes(result.reason) ? result.reason : 'invalid-data' }
            if (result?.ok !== true || typeof result.stdout !== 'string') return { ok: false, reason: 'invalid-data' }
            if (Buffer.byteLength(result.stdout) > MAX_BUFFER) return { ok: false, reason: 'output-limit' }
            return { ok: true, stdout: result.stdout }
        } catch {
            return { ok: false, reason: 'command-failed' }
        }
    }

    const services = {}
    for (const service of SERVICES) {
        const discovered = await command([
            'ps', '--all', '--no-trunc', '--quiet', '--filter', 'label=com.docker.compose.project=lef',
            '--filter', `label=com.docker.compose.service=${service}`,
        ])
        if (!discovered.ok) {
            services[service] = unavailable(discovered.reason)
            continue
        }
        const ids = discovered.stdout.trim() ? discovered.stdout.trim().split(/\s+/) : []
        if (ids.some(id => !/^[a-f0-9]{64}$/.test(id))) {
            services[service] = unavailable('invalid-data')
            continue
        }
        if (ids.length !== 1) {
            services[service] = uncollected(ids.length ? 'ambiguous' : 'missing')
            continue
        }
        const inspected = await command(['inspect', '--type', 'container', '--format', INSPECTION_FORMAT, ids[0]])
        if (!inspected.ok) {
            services[service] = unavailable(inspected.reason)
            continue
        }
        let record
        try {
            record = projectInspection(JSON.parse(inspected.stdout), service, checkoutRoot)
        } catch {
            record = unavailable('invalid-data')
        }
        services[service] = record
        if (record.result !== 'collected' || !['keycloak', 'api'].includes(service)) continue
        const logs = await command(['logs', '--tail', '200', ids[0]])
        if (logs.ok) record.startupSample = summarizeStartupLogs(logs.stdout)
        else record.reason = logs.reason
    }
    return envelope(services)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    let summary
    try {
        if (process.argv.length !== 2) throw new Error()
        summary = await collectDiagnostics({ checkoutRoot: resolve(import.meta.dirname, '../..') })
    } catch {
        summary = envelope(Object.fromEntries(SERVICES.map(service => [service, unavailable('invalid-data')])))
    }
    let output = JSON.stringify(summary) + '\n'
    if (Buffer.byteLength(output) > MAX_OUTPUT) {
        output = JSON.stringify(envelope(Object.fromEntries(SERVICES.map(service => [service, unavailable('output-limit')])))) + '\n'
    }
    process.stdout.on('error', () => { process.exitCode = 1 })
    process.stdout.write(output)
}
