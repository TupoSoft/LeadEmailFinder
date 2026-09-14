import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVICES = ['keycloak', 'api', 'keycloak-postgres', 'postgres', 'redis', 'garage', 'web', 'bullboard']
const RESULTS = ['collected', 'missing', 'ambiguous', 'foreign', 'unavailable']
const REASONS = ['timeout', 'output-limit', 'command-failed', 'invalid-data']
const STATES = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead', 'unknown']
const HEALTH = ['starting', 'healthy', 'unhealthy', 'none', 'unknown']
const MARKERS = [
    ['ECONNREFUSED', 'connection-refused'],
    ['ETIMEDOUT', 'connection-timeout'],
    ['ENOTFOUND', 'name-resolution'],
    ['OutOfMemoryError', 'memory-error'],
    ['Unable to connect to the database', 'database-retry'],
    ['Failed to start server', 'startup-failed'],
]
const COMMAND_TIMEOUT_MS = 5_000
const COLLECTION_TIMEOUT_MS = 45_000
const EMIT_RESERVE_MS = 100
const COMMAND_BYTES = 65_536
const SUMMARY_BYTES = 32_768
const MAX_EPOCH_MS = 8_640_000_000_000_000

// Docker emits only this projection. In particular, never serialize State, Health,
// Labels, or a whole probe: each may contain arbitrary output or credentials.
const INSPECT_FORMAT = [
    '{"project":{{json (index .Config.Labels "com.docker.compose.project")}},',
    '"service":{{json (index .Config.Labels "com.docker.compose.service")}},',
    '"workingDirectory":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},',
    '"configFiles":{{json (index .Config.Labels "com.docker.compose.project.config_files")}},',
    '"state":{{json .State.Status}},"oomKilled":{{json .State.OOMKilled}},',
    '"restartCount":{{json .RestartCount}},"exitCode":{{json .State.ExitCode}},',
    '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"none"{{end}},',
    '"failingStreak":{{if .State.Health}}{{json .State.Health.FailingStreak}}{{else}}null{{end}},',
    '"probes":[{{if .State.Health}}{{$first := true}}{{range $index, $probe := .State.Health.Log}}',
    '{{if le (len (slice $.State.Health.Log $index)) 5}}{{if not $first}},{{end}}{{$first = false}}',
    '{"start":{{json $probe.Start}},"end":{{json $probe.End}},',
    '"exitCode":{{json $probe.ExitCode}}}{{end}}{{end}}{{end}}]}',
].join('')

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isInteger(value, minimum, maximum) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

function unavailable(reason) {
    return { result: 'unavailable', reason, state: 'unknown', health: 'unknown' }
}

function failureReason(error) {
    if (error?.code === 'ETIMEDOUT') return 'timeout'
    if (error?.code === 'ENOBUFS') return 'output-limit'
    return 'command-failed'
}

// Failed child output is discarded inside the adapter as well as at its caller.
export function runDockerCommand(args, { cwd, timeout = COMMAND_TIMEOUT_MS, maxBuffer = COMMAND_BYTES } = {}) {
    try {
        const result = spawnSync('docker', args, {
            cwd,
            encoding: 'utf8',
            timeout: Math.max(1, Math.min(COMMAND_TIMEOUT_MS, Math.floor(timeout))),
            maxBuffer: Math.max(1, Math.min(COMMAND_BYTES, Math.floor(maxBuffer))),
            killSignal: 'SIGKILL',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        const outputBytes = Buffer.byteLength(result.stdout ?? '') + Buffer.byteLength(result.stderr ?? '')
        const code = result.error?.code ?? (outputBytes > Math.min(COMMAND_BYTES, maxBuffer) ? 'ENOBUFS' : undefined)
        if (code || result.status !== 0) {
            return { status: result.status, stdout: '', stderr: '', error: { code } }
        }
        return { status: 0, stdout: result.stdout, stderr: result.stderr }
    } catch {
        return { status: null, stdout: '', stderr: '', error: {} }
    }
}

function epochMilliseconds(value) {
    if (typeof value !== 'string') return undefined
    const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
        value,
    )
    if (!matched) return undefined
    const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = matched
        .slice(1)
        .map(part => Number(part ?? 0))
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > daysInMonth[month - 1] ||
        hour > 23 ||
        minute > 59 ||
        second > 59 ||
        offsetHour > 23 ||
        offsetMinute > 59
    )
        return undefined
    const timestamp = Date.parse(value)
    return isInteger(timestamp, -MAX_EPOCH_MS, MAX_EPOCH_MS) ? timestamp : undefined
}

function projectProbes(probes, parseTime) {
    if (!Array.isArray(probes)) return undefined
    return probes.slice(-5).flatMap(probe => {
        if (!isObject(probe)) return []
        const projected = {}
        for (const field of ['start', 'end']) {
            const time = parseTime(probe[field])
            if (time !== undefined) projected[field] = time
        }
        if (isInteger(probe.exitCode, -1, 255)) projected.exitCode = probe.exitCode
        return Object.keys(projected).length ? [projected] : []
    })
}

function projectFacts(value, parseTime) {
    const facts = {
        state: STATES.includes(value.state) ? value.state : 'unknown',
        health: HEALTH.includes(value.health) ? value.health : 'unknown',
    }
    if (typeof value.oomKilled === 'boolean') facts.oomKilled = value.oomKilled
    for (const field of ['restartCount', 'failingStreak']) {
        if (isInteger(value[field], 0, 1_000_000)) facts[field] = value[field]
    }
    if (isInteger(value.exitCode, -1, 255)) facts.exitCode = value.exitCode
    const probes = projectProbes(value.probes, parseTime)
    if (probes !== undefined) facts.probes = probes
    return facts
}

function projectInspection(value, checkoutRoot, service) {
    if (
        !isObject(value) ||
        ['project', 'service', 'workingDirectory', 'configFiles', 'state', 'health'].some(
            field => typeof value[field] !== 'string',
        )
    )
        return unavailable('invalid-data')
    if (
        value.project !== 'lef' ||
        value.service !== service ||
        ![checkoutRoot, resolve(checkoutRoot, 'docker')].includes(value.workingDirectory) ||
        value.configFiles !== resolve(checkoutRoot, 'docker/compose.yaml')
    )
        return { result: 'foreign', state: 'unknown', health: 'unknown' }
    return { result: 'collected', ...projectFacts(value, epochMilliseconds) }
}

function startupSample(stdout, stderr) {
    // Docker routes application stderr through its own stderr on successful logs.
    // There is no shared ordering across pipes; take the latest bounded merged sample.
    const lines = [stdout, stderr]
        .flatMap(output => {
            if (!output) return []
            const parts = output.split(/\r?\n/)
            if (parts.at(-1) === '') parts.pop()
            return parts
        })
        .slice(-200)
    const markers = Object.fromEntries(MARKERS.map(([, label]) => [label, 0]))
    for (const line of lines) {
        for (const [marker, label] of MARKERS) {
            if (line.includes(marker)) markers[label] += 1
        }
    }
    return { sampledLines: lines.length, markers }
}

function envelope(services) {
    return {
        schemaVersion: 1,
        collectionStatus: SERVICES.every(service => services[service].result === 'collected') ? 'complete' : 'partial',
        services,
    }
}

export function collectDiagnostics({ checkoutRoot, runCommand = runDockerCommand, now = () => performance.now() }) {
    const deadline = now() + COLLECTION_TIMEOUT_MS - EMIT_RESERVE_MS
    const services = {}
    function command(args) {
        const remaining = Math.floor(deadline - now())
        if (remaining <= 0) return { reason: 'timeout' }
        try {
            const result = runCommand(args, {
                cwd: checkoutRoot,
                timeout: Math.min(COMMAND_TIMEOUT_MS, remaining),
                maxBuffer: COMMAND_BYTES,
            })
            if (now() > deadline) return { reason: 'timeout' }
            if (result?.error) return { reason: failureReason(result.error) }
            if (result?.status !== 0) return { reason: 'command-failed' }
            if (typeof result.stdout !== 'string' || typeof result.stderr !== 'string')
                return { reason: 'invalid-data' }
            if (Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > COMMAND_BYTES)
                return { reason: 'output-limit' }
            return { stdout: result.stdout, stderr: result.stderr }
        } catch (error) {
            return { reason: failureReason(error) }
        }
    }
    for (const service of SERVICES) {
        const discovery = command([
            'ps',
            '--all',
            '--no-trunc',
            '--quiet',
            '--filter',
            'label=com.docker.compose.project=lef',
            '--filter',
            `label=com.docker.compose.service=${service}`,
        ])
        if (discovery.reason) {
            services[service] = unavailable(discovery.reason)
            continue
        }
        const ids = discovery.stdout.trim() ? discovery.stdout.trim().split(/\s+/) : []
        if (ids.some(id => !/^[a-f0-9]{12,64}$/.test(id))) {
            services[service] = unavailable('invalid-data')
            continue
        }
        if (ids.length !== 1) {
            services[service] = { result: ids.length ? 'ambiguous' : 'missing', state: 'unknown', health: 'unknown' }
            continue
        }
        const inspection = command(['inspect', '--format', INSPECT_FORMAT, ids[0]])
        if (inspection.reason) {
            services[service] = unavailable(inspection.reason)
            continue
        }
        let record
        try {
            record = projectInspection(JSON.parse(inspection.stdout), checkoutRoot, service)
        } catch {
            record = unavailable('invalid-data')
        }
        services[service] = record
        if (record.result !== 'collected' || !['keycloak', 'api'].includes(service)) continue
        const logs = command(['logs', '--tail', '200', ids[0]])
        if (logs.reason) {
            record.result = 'unavailable'
            record.reason = logs.reason
        } else {
            record.startupSample = startupSample(logs.stdout, logs.stderr)
        }
    }
    return envelope(services)
}

// Rebuild the complete allowlist at the output boundary; even supplied extra
// properties and toJSON methods cannot copy unknown data into the Actions log.
export function serializeDiagnostics(summary) {
    const services = {}
    for (const service of SERVICES) {
        const value = summary?.services?.[service]
        if (!isObject(value) || !RESULTS.includes(value.result)) {
            services[service] = unavailable('invalid-data')
            continue
        }
        const record = {
            result: value.result,
            ...projectFacts(value, time => (isInteger(time, -MAX_EPOCH_MS, MAX_EPOCH_MS) ? time : undefined)),
        }
        if (REASONS.includes(value.reason)) record.reason = value.reason
        if (['keycloak', 'api'].includes(service) && isObject(value.startupSample)) {
            const sample = value.startupSample
            if (isInteger(sample.sampledLines, 0, 200) && isObject(sample.markers)) {
                record.startupSample = {
                    sampledLines: sample.sampledLines,
                    markers: Object.fromEntries(
                        MARKERS.map(([, label]) => [
                            label,
                            isInteger(sample.markers[label], 0, sample.sampledLines) ? sample.markers[label] : 0,
                        ]),
                    ),
                }
            }
        }
        services[service] = record
    }
    const output = `${JSON.stringify(envelope(services))}\n`
    if (Buffer.byteLength(output) <= SUMMARY_BYTES) return output
    return `${JSON.stringify(envelope(Object.fromEntries(SERVICES.map(service => [service, unavailable('output-limit')]))))}\n`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let summary
    try {
        if (process.argv.length !== 2) throw new Error()
        summary = collectDiagnostics({ checkoutRoot: resolve(dirname(fileURLToPath(import.meta.url)), '../..') })
    } catch {
        summary = envelope(Object.fromEntries(SERVICES.map(service => [service, unavailable('invalid-data')])))
        process.exitCode = 1
    }
    process.stdout.write(serializeDiagnostics(summary))
}
