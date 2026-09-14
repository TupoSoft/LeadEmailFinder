import { execFile } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

export const INSPECT_FORMAT = '{{.State.Status}}\t{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
const INSPECTION_LIMIT_MS = 5_000
const POLL_INTERVAL_MS = 2_000
const OUTPUT_LIMIT_BYTES = 4_096
const LIFECYCLE_STATES = new Set(['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'])
const HEALTH_STATES = new Set(['none', 'starting', 'healthy', 'unhealthy'])
const NORMALIZED_STATUSES = new Set([
    ...LIFECYCLE_STATES,
    'starting',
    'healthy',
    'unhealthy',
    'no-healthcheck',
    'inspect-failed',
    'inspect-timeout',
    'inspect-output-limit',
    'inspect-unavailable',
    'inspect-malformed',
])

export function parseTimeoutSeconds(value) {
    if (typeof value !== 'string' || !/^[1-9][0-9]{0,2}$/.test(value) || Number(value) > 600) {
        throw new Error('Timeout must be a decimal integer from 1 through 600 without leading zeros.')
    }
    return Number(value)
}

function validateContainerName(container) {
    if (typeof container !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container)) {
        throw new Error('Invalid container name.')
    }
}

function normalizeInspection(output) {
    const match = /^([^\t\r\n]+)\t([^\t\r\n]+)\r?\n?$/.exec(output)
    if (!match || !LIFECYCLE_STATES.has(match[1]) || !HEALTH_STATES.has(match[2])) {
        return 'inspect-malformed'
    }
    const [, lifecycle, health] = match
    if (lifecycle !== 'running') return lifecycle
    return health === 'none' ? 'no-healthcheck' : health
}

// Keep process errors and buffered output inside this adapter; callers receive only categories.
export function inspectContainer(container, timeoutMs, { executable = 'docker' } = {}) {
    validateContainerName(container)
    const boundedTimeoutMs = Math.min(INSPECTION_LIMIT_MS, Math.floor(timeoutMs))
    if (!Number.isFinite(boundedTimeoutMs) || boundedTimeoutMs < 1) {
        return Promise.resolve('inspect-timeout')
    }
    return new Promise(resolveInspection => {
        execFile(
            executable,
            ['inspect', '--format', INSPECT_FORMAT, '--', container],
            {
                encoding: 'utf8',
                timeout: boundedTimeoutMs,
                killSignal: 'SIGKILL',
                maxBuffer: OUTPUT_LIMIT_BYTES,
            },
            (error, stdout) => {
                if (error) {
                    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') resolveInspection('inspect-output-limit')
                    else if (error.killed) resolveInspection('inspect-timeout')
                    else if (error.code === 'ENOENT') resolveInspection('inspect-unavailable')
                    else resolveInspection('inspect-failed')
                    return
                }
                resolveInspection(normalizeInspection(stdout))
            },
        )
    })
}

export async function waitForContainerHealthy({
    container,
    timeoutSeconds,
    now = () => performance.now(),
    sleep: pause = sleep,
    inspect = inspectContainer,
}) {
    validateContainerName(container)
    const budgetSeconds = parseTimeoutSeconds(String(timeoutSeconds))
    const started = now()
    const deadline = started + budgetSeconds * 1_000
    let status = 'not-inspected'
    const result = outcome => ({
        container,
        timeoutSeconds: budgetSeconds,
        elapsedMs: now() - started,
        status,
        outcome,
    })

    while (true) {
        const remainingMs = Math.floor(deadline - now())
        if (remainingMs < 1) return result('timeout')

        try {
            const inspectedStatus = await inspect(container, Math.min(INSPECTION_LIMIT_MS, remainingMs))
            status = NORMALIZED_STATUSES.has(inspectedStatus) ? inspectedStatus : 'inspect-malformed'
        } catch {
            status = 'inspect-failed'
        }

        // Inspection time consumes the same deadline; late health cannot rescue an expired wait.
        if (now() >= deadline) return result('timeout')
        if (status === 'healthy') return result('healthy')
        if (status === 'dead') return result('dead')
        await pause(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - now())))
    }
}

async function main(args) {
    if (args[0] === '--validate-timeout' && args.length === 2) {
        parseTimeoutSeconds(args[1])
        return
    }
    if (args.length !== 2 || args[0]?.startsWith('--')) {
        throw new Error('Usage: wait-container-healthy.mjs <container> <seconds> or --validate-timeout <seconds>.')
    }
    const timeoutSeconds = parseTimeoutSeconds(args[1])
    const result = await waitForContainerHealthy({ container: args[0], timeoutSeconds })
    const message = `Container ${result.container}: budget=${result.timeoutSeconds}s elapsed=${(result.elapsedMs / 1_000).toFixed(3)}s status=${result.status} outcome=${result.outcome}`
    if (result.outcome === 'healthy') console.log(message)
    else {
        console.error(message)
        process.exitCode = 1
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch(error => {
        // Only errors created by input validation reach this boundary.
        console.error(error.message)
        process.exitCode = 1
    })
}
