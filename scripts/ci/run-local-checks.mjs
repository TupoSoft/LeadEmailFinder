import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { consumers, discoverChangedPaths, selectValidation } from './select-validation.mjs'

const jobConsumers = {
    'repository-policy': 'repositoryPolicy', backend: 'backend', web: 'web', contract: 'contract',
    images: 'images', 'browser-artifacts': 'browser', 'browser-ui': 'browser', 'browser-live': 'browser',
}
const infrastructureJobs = ['changes', 'browser', 'validate']
const discoveryCommand = `test "$DISCOVERY_RESULT" = success
case "$VALIDATION_SELECTED" in
  true|false) ;;
  *) echo "Missing or invalid validation selection" >&2; exit 1 ;;
esac`
const storeCommand = `echo "path=$(corepack pnpm store path --silent)" >> "$GITHUB_OUTPUT"
echo "version=$(corepack pnpm --version)" >> "$GITHUB_OUTPUT"`
const dependencyCommands = new Set([
    'corepack pnpm install --frozen-lockfile',
    'corepack pnpm --filter @tuposoft/lead-email-finder-web... install --frozen-lockfile',
    'corepack pnpm --filter @tuposoft/lead-email-finder... --filter @tuposoft/lead-email-finder-api-client... install --frozen-lockfile',
])
const databaseVariables = [
    'TEST_POSTGRES_URL', 'TEST_CREDITS_POSTGRES_URL', 'TEST_PAYMENT_WEBHOOK_POSTGRES_URL',
    'TEST_EMAIL_VERIFICATION_PERSISTENCE_POSTGRES_URL', 'TEST_ORGANIZATION_DIRECTORY_POSTGRES_URL',
]

function assert(condition, message) {
    if (!condition) throw new Error(`Local validation: ${message}`)
}

function fields(object, allowed, label) {
    assert(object && typeof object === 'object' && !Array.isArray(object), `${label} must be an object`)
    for (const key of Object.keys(object)) assert(allowed.includes(key), `unsupported ${label} field: ${key}`)
}

function equal(actual, expected, label) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), `unsupported ${label}`)
}

function plain(value, label) {
    assert(['string', 'number', 'boolean'].includes(typeof value), `${label} must be a scalar`)
    const result = String(value)
    assert(!result.includes('${{'), `unresolved GitHub expression in ${label}`)
    return result
}

function environment(values, selection, base) {
    fields(values, Object.keys(values), 'environment')
    return Object.fromEntries(Object.entries(values).map(([key, value]) => {
        if (value === '${{ github.event.pull_request.base.sha || github.event.before }}') return [key, base ?? '']
        if (value === '${{ needs.changes.result }}' || value === '${{ needs.browser-artifacts.result }}') return [key, 'success']
        const selected = typeof value === 'string' && value.match(/^\$\{\{ needs\.changes\.outputs\.(\w+) \}\}$/)
        if (selected) {
            assert(consumers.includes(selected[1]), `unknown selection: ${selected[1]}`)
            return [key, String(selection[selected[1]])]
        }
        return [key, plain(value, `environment ${key}`)]
    }))
}

function quote(value) {
    return `'${String(value).replaceAll("'", "'\\''")}'`
}

function stepCondition(condition, consumer, label) {
    if (condition === undefined) return 'run'
    if (condition === `needs.changes.outputs.${consumer} == 'true'`) return 'run'
    if (condition === `needs.changes.outputs.${consumer} == 'false'`) return 'unselected'
    if (condition === "always() && needs.changes.outputs.browser == 'true' && steps.browser-live-checkout.outcome == 'success'") return 'cleanup'
    throw new Error(`Local validation: unsupported condition in ${label}: ${condition}`)
}

function actionCommand(step, label) {
    const options = step.with ?? {}
    switch (step.uses) {
        case 'actions/checkout@v4':
            equal(options, { 'fetch-depth': 0 }, `${label} checkout options`)
            return null
        case 'actions/setup-node@v4':
            equal(options, { 'node-version': 24 }, `${label} Node setup options`)
            return null
        case 'ruby/setup-ruby@v1':
            equal(options, { 'ruby-version': '3.3' }, `${label} Ruby setup options`)
            return null
        case 'actions/cache@v4':
            fields(options, ['path', 'key', 'restore-keys'], `${label} cache options`)
            equal(options.path, '${{ steps.pnpm-store.outputs.path }}', `${label} cache path`)
            return null
        case 'docker/setup-buildx-action@v4':
            equal(options, { driver: 'docker-container', use: false }, `${label} Buildx options`)
            return null
        case 'docker/build-push-action@v7': {
            fields(options, ['builder', 'context', 'file', 'tags', 'load', 'push', 'cache-from', 'cache-to'], `${label} build options`)
            equal(options.builder, '${{ steps.buildx.outputs.name }}', `${label} builder`)
            assert(options.load === true && options.push === false, `${label} requires a local image build`)
            for (const key of ['cache-from', 'cache-to']) {
                if (options[key] !== undefined) assert(/^type=gha,/.test(plain(options[key], key)), `unsupported ${label} ${key}`)
            }
            const tags = plain(options.tags, `${label} tags`).split(/[\n,]/).map(tag => tag.trim()).filter(Boolean)
            assert(tags.length > 0, `${label} requires an image tag`)
            return `docker build --file ${quote(plain(options.file, `${label} file`))} ${tags.map(tag => `--tag ${quote(tag)}`).join(' ')} ${quote(plain(options.context, `${label} context`))}`
        }
        default:
            throw new Error(`Local validation: unsupported action in ${label}: ${step.uses}`)
    }
}

function ignoredRun(step, jobId) {
    const command = step.run.trim()
    const expected = {
        'Enable Corepack': 'corepack enable',
        'Locate pnpm store': storeCommand,
        'Validate discovery result': discoveryCommand,
        'Require browser artifact guards to succeed': 'test "$BROWSER_ARTIFACTS_RESULT" = success',
        'No validation needed': `echo "${jobId}: selected=$VALIDATION_SELECTED; checks were not run."`,
        'Select affected validation': 'node scripts/ci/select-validation.mjs --event',
        'Require every browser worker to succeed': 'node scripts/ci/browser-summary.mjs',
        'Require every validation consumer to succeed': 'node scripts/ci/validation-summary.mjs',
    }
    if (Object.hasOwn(expected, step.name)) {
        equal(command, expected[step.name], `${jobId}/${step.name} orchestration command`)
        return true
    }
    if (['Install dependencies', 'Install workspace dependencies'].includes(step.name)) {
        assert(dependencyCommands.has(command), `unsupported dependency setup command: ${command}`)
        return true
    }
    return false
}

function postgresService(services) {
    fields(services, ['postgres'], 'backend services')
    const postgres = services.postgres
    fields(postgres, ['image', 'env', 'ports', 'options'], 'PostgreSQL service')
    equal(postgres.image, "${{ needs.changes.outputs.backend == 'true' && 'postgres:18-alpine' || '' }}", 'PostgreSQL image')
    equal(postgres.env, { POSTGRES_DB: 'lef_identity_test', POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: 'postgres' }, 'PostgreSQL environment')
    equal(postgres.ports, ['5432:5432'], 'PostgreSQL port')
    equal(postgres.options, '--health-cmd "pg_isready -U postgres -d lef_identity_test" --health-interval 5s --health-timeout 5s --health-retries 10', 'PostgreSQL health check')
    return `docker run --detach --name lef-local-postgres --publish 127.0.0.1:5432:5432 ${Object.entries(postgres.env).map(([key, value]) => `--env ${quote(`${key}=${value}`)}`).join(' ')} ${postgres.options} postgres:18-alpine`
}

/** Compile only this repository's supported workflow features; drift must fail before any checks run. */
export function compileWorkflow(workflow, selection, { base } = {}) {
    fields(workflow, ['name', 'on', 'permissions', 'concurrency', 'jobs'], 'workflow')
    fields(workflow.jobs, [...infrastructureJobs, ...Object.keys(jobConsumers)], 'jobs')
    for (const id of [...infrastructureJobs, ...Object.keys(jobConsumers)]) assert(workflow.jobs[id], `missing job: ${id}`)
    equal(Object.keys(selection).sort(), [...consumers].sort(), 'selection keys')
    assert(Object.values(selection).every(value => typeof value === 'boolean'), 'selection flags must be booleans')
    const jobs = []
    const accounted = []
    for (const [id, job] of Object.entries(workflow.jobs)) {
        fields(job, ['name', 'needs', 'if', 'runs-on', 'env', 'steps', 'timeout-minutes', ...(id === 'backend' ? ['services'] : []), ...(id === 'changes' ? ['outputs'] : [])], `job ${id}`)
        if (id !== 'changes') equal(job.if, '${{ !cancelled() }}', `${id} job condition`)
        const expectedNeeds = id === 'changes' ? undefined
            : id === 'browser' ? ['changes', 'browser-artifacts', 'browser-ui', 'browser-live']
                : id === 'validate' ? ['changes', 'repository-policy', 'backend', 'web', 'contract', 'images', 'browser']
                    : ['browser-ui', 'browser-live'].includes(id) ? ['changes', 'browser-artifacts'] : ['changes']
        equal(job.needs, expectedNeeds, `${id} dependencies`)
        if (id === 'changes') equal(job.outputs, Object.fromEntries(consumers.map(key => [key, `\${{ steps.select.outputs.${key} }}`])), 'discovery outputs')
        const consumer = jobConsumers[id]
        const entry = { id, selected: consumer ? selection[consumer] : false, steps: [], cleanup: [], env: environment(job.env ?? {}, selection, base) }
        if (job['timeout-minutes'] !== undefined) {
            assert(Number.isFinite(job['timeout-minutes']) && job['timeout-minutes'] > 0, `invalid ${id} timeout`)
            entry.timeoutMs = job['timeout-minutes'] * 60_000
        }
        if (id === 'backend') entry.service = postgresService(job.services)
        assert(Array.isArray(job.steps), `${id} steps must be an array`)
        for (const [index, step] of job.steps.entries()) {
            const label = `${id}/${step.name ?? step.uses ?? index}`
            fields(step, ['name', 'id', 'if', 'uses', 'with', 'run', 'env', 'continue-on-error', 'timeout-minutes', 'shell'], label)
            assert((typeof step.run === 'string') !== (typeof step.uses === 'string'), `${label} needs exactly one run command or action`)
            assert(step['continue-on-error'] === undefined || typeof step['continue-on-error'] === 'boolean', `${label} has unsupported continue-on-error`)
            assert(step.shell === undefined || step.shell === 'bash', `${label} has unsupported shell`)
            const condition = stepCondition(step.if, consumer, label)
            let command
            if (step.uses) command = actionCommand(step, label)
            else {
                assert(step.with === undefined, `${label} run command cannot have action options`)
                command = ignoredRun(step, id) ? null : plain(step.run, label)
                // A new remote branch has no before commit. Do not silently lint only HEAD^ in that case.
                if (!base && command?.trim() === 'corepack pnpm docs:lint:changed') command = 'corepack pnpm docs:lint'
            }
            const aggregateEnv = id === 'browser' ? { BROWSER_NEEDS_JSON: '${{ toJSON(needs) }}' }
                : id === 'validate' ? { VALIDATION_NEEDS_JSON: '${{ toJSON(needs) }}' } : null
            let env = {}
            if (aggregateEnv && step.run) equal(step.env, aggregateEnv, `${label} aggregate environment`)
            else env = environment(step.env ?? {}, selection, base)
            assert(command === null || consumer, `unaccounted command in orchestration job ${label}`)
            assert(condition !== 'unselected' || command === null, `unaccounted unselected command ${label}`)
            assert(command === null || !step.run || step.run.trim().length > 0, `${label} command is empty`)
            if (step['timeout-minutes'] !== undefined) assert(Number.isFinite(step['timeout-minutes']) && step['timeout-minutes'] > 0, `${label} has invalid timeout`)
            accounted.push({ job: id, index, label, kind: command === null ? 'setup-or-orchestration' : condition === 'cleanup' ? 'cleanup' : 'check', command })
            if (command !== null) entry[condition === 'cleanup' ? 'cleanup' : 'steps'].push({
                label, command, env,
                advisory: id === 'repository-policy' && ['corepack pnpm docs:lint:changed', 'corepack pnpm docs:lint'].includes(command.trim()),
                timeoutMs: step['timeout-minutes'] ? step['timeout-minutes'] * 60_000 : undefined,
            })
        }
        if (consumer) jobs.push(entry)
    }
    // Match the hosted dependencies while avoiding shared-port conflicts between the backend and live stack.
    jobs.sort((left, right) => Object.keys(jobConsumers).indexOf(left.id) - Object.keys(jobConsumers).indexOf(right.id))
    return { jobs, accounted }
}

export function selectLocalValidation({ base, commit, repository = process.cwd(), discover = discoverChangedPaths }) {
    try {
        return selectValidation(discover('push', { before: base, after: commit }, repository), { comparisonTrusted: true })
    } catch {
        return selectValidation(null)
    }
}

export function executeShell({ command, env, timeoutMs, label }) {
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', command], {
        env, stdio: 'inherit', timeout: timeoutMs,
    })
    if (result.error) throw new Error(`${label}: ${result.error.message}`, { cause: result.error })
    assert(result.status === 0, `${label} failed (${result.signal ?? `exit ${result.status}`})`)
}

/** Execute in the disposable runner only: its private Docker daemon owns every created resource. */
export async function runChecks(plan, { execute = executeShell, env = process.env, log = console.log, now = Date.now } = {}) {
    const baseEnv = { ...env, CI: 'true', HUSKY: '0', API_START_COMMAND: 'pnpm exec nest start' }
    for (const name of databaseVariables) delete baseEnv[name]
    for (const job of plan.jobs) {
        if (!job.selected) {
            log(`${job.id}: no affected checks`)
            continue
        }
        const started = now()
        const run = async (step, cleanup = false) => {
            log(`Local validation: ${step.label}`)
            let timeoutMs = step.timeoutMs
            if (!cleanup && job.timeoutMs) {
                const remaining = job.timeoutMs - (now() - started)
                assert(remaining > 0, `${job.id} exceeded its workflow timeout`)
                timeoutMs = Math.min(timeoutMs ?? Infinity, remaining)
            }
            try {
                await execute({ ...step, timeoutMs, env: { ...baseEnv, ...job.env, ...step.env } })
            } catch (error) {
                // Only Harper is advisory locally; other hosted continue-on-error checks must stop.
                if (!step.advisory) throw error
                log(`Advisory check failed: ${step.label}: ${error.message}`)
            }
        }
        let failure
        try {
            if (job.service) {
                await run({ label: 'backend/Start PostgreSQL', command: job.service })
                await run({ label: 'backend/Wait for PostgreSQL', timeoutMs: 70_000, command: `for attempt in {1..60}; do
  health=$(docker inspect --format '{{.State.Health.Status}}' lef-local-postgres)
  if [ "$health" = healthy ]; then exit 0; fi
  if [ "$health" = unhealthy ]; then docker logs lef-local-postgres; exit 1; fi
  sleep 1
done
docker logs lef-local-postgres
exit 1` })
            }
            for (const step of job.steps) await run(step)
        } catch (error) {
            failure = error
        } finally {
            const cleanup = [...job.cleanup]
            if (job.service) cleanup.push({ label: 'backend/Stop PostgreSQL', command: 'docker rm --force --volumes lef-local-postgres', timeoutMs: 60_000 })
            for (const step of cleanup) {
                try { await run(step, true) } catch (error) {
                    if (!failure) failure = error
                    else log(`Cleanup also failed: ${step.label}: ${error.message}`)
                }
            }
        }
        if (failure) throw failure
    }
}

export function readWorkflow(repository = process.cwd()) {
    const require = createRequire(resolve(repository, 'package.json'))
    return require('yaml').parse(readFileSync(resolve(repository, '.github/workflows/validate.yml'), 'utf8'))
}

export async function main(env = process.env) {
    assert(env.LEF_LOCAL_CI_CONTAINER === '1', 'this command must run inside the isolated local CI container')
    const selection = selectLocalValidation({ base: env.LEF_VALIDATION_BASE, commit: env.LEF_VALIDATION_COMMIT })
    console.log(`Local validation selection: ${JSON.stringify(selection)}`)
    if (!env.LEF_VALIDATION_BASE) console.log('No push comparison is available: Harper checks every tracked Markdown file; the approval checker uses its existing HEAD^ revision baseline.')
    const plan = compileWorkflow(readWorkflow(), selection, { base: env.LEF_VALIDATION_BASE })
    await runChecks(plan, { env })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try { await main() } catch (error) {
        console.error(error.message)
        process.exitCode = 1
    }
}
