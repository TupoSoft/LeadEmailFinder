import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { isMap, parseAllDocuments } from 'yaml'

const root = resolve(__dirname, '../..')
const source = readFileSync(resolve(root, '.github/workflows/validate.yml'), 'utf8')
const consumerFlags = {
    'repository-policy': 'repositoryPolicy',
    backend: 'backend',
    web: 'web',
    contract: 'contract',
    images: 'images',
    browser: 'browser',
} as const
const dependencies = ['changes', ...Object.keys(consumerFlags)]

interface Step {
    id?: string
    name?: string
    if?: string
    run?: string
    uses?: string
    env?: Record<string, string>
    with?: Record<string, unknown>
    'continue-on-error'?: boolean
}

interface Job {
    name?: string
    if?: string
    needs?: string | string[]
    env?: Record<string, string>
    outputs?: Record<string, string>
    services?: Record<string, { image?: string; env?: Record<string, string> }>
    steps: Step[]
    'continue-on-error'?: boolean
}

interface Workflow {
    name: string
    on: Record<string, unknown>
    permissions: Record<string, string>
    jobs: Record<string, Job>
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseWorkflow(text: string): Workflow {
    const documents = parseAllDocuments(text, { uniqueKeys: true })
    if (documents.length !== 1 || documents[0].errors.length > 0 || !isMap(documents[0].contents)) {
        throw new Error('Expected one valid YAML mapping document with unique keys.')
    }
    const workflow: unknown = documents[0].toJS()
    if (!isRecord(workflow) || !isRecord(workflow.jobs) || Object.keys(workflow.jobs).length === 0) {
        throw new Error('Expected a nonempty jobs mapping.')
    }
    for (const [id, job] of Object.entries(workflow.jobs)) {
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id) || !isRecord(job) || !Array.isArray(job.steps)) {
            throw new Error('Expected valid job IDs and step arrays.')
        }
        if (typeof job['runs-on'] !== 'string' || job.steps.length === 0) {
            throw new Error('Every job must declare a runner and at least one step.')
        }
        if (job.if !== undefined && typeof job.if !== 'string') {
            throw new Error('Job conditions must be expressions.')
        }
        for (const property of ['env', 'outputs', 'services']) {
            if (job[property] !== undefined && !isRecord(job[property])) {
                throw new Error(`Job ${property} must be a mapping.`)
            }
        }
        const needs = typeof job.needs === 'string' ? [job.needs] : (job.needs ?? [])
        if (
            !Array.isArray(needs) ||
            new Set(needs).size !== needs.length ||
            needs.some((need: unknown) => typeof need !== 'string' || need === id || !Object.hasOwn(workflow.jobs as object, need))
        ) {
            throw new Error('Job needs must name distinct declared dependencies.')
        }
        const stepIds = new Set<string>()
        for (const step of job.steps as unknown[]) {
            if (
                !isRecord(step) ||
                Object.hasOwn(step, 'run') === Object.hasOwn(step, 'uses') ||
                (step.run !== undefined && (typeof step.run !== 'string' || step.run.trim() === '')) ||
                (step.uses !== undefined && (typeof step.uses !== 'string' || step.uses.trim() === ''))
            ) {
                throw new Error('Every step must declare exactly one run or uses string.')
            }
            if (step.id !== undefined) {
                if (typeof step.id !== 'string' || stepIds.has(step.id)) {
                    throw new Error('Step IDs must be unique strings.')
                }
                stepIds.add(step.id)
            }
            if (step.if !== undefined && typeof step.if !== 'string') {
                throw new Error('Step conditions must be expressions.')
            }
            if (step.env !== undefined && !isRecord(step.env)) {
                throw new Error('Step environments must be mappings.')
            }
        }
    }
    return workflow as unknown as Workflow
}

function condition(value: string | undefined): string {
    return (value ?? '').replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, '').trim()
}

function command(value: string | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim()
}

function needsOf(job: Job): string[] {
    return typeof job.needs === 'string' ? [job.needs] : (job.needs ?? [])
}

const workflow = parseWorkflow(source)

// These are the commands established by the prerequisite plans. Keep complete commands
// here so reorganizing the workflow cannot silently remove a validation or narrow its arguments.
const preservedCommands: Record<string, string[]> = {
    'repository-policy': [
        'corepack pnpm test:docs-lint',
        'corepack pnpm privacy:account-discovery-approvals-check',
        'corepack pnpm security:scan-linkedin-session-material -- --scope=working-tree',
        'corepack pnpm docs:lint:changed',
        'corepack pnpm architecture:check',
        'corepack pnpm test -- select-validation validate-workflow --runInBand',
        'corepack pnpm test:ci-paths',
    ],
    backend: [
        'ruby -c deploy/proxy-fleet/vagrant/Vagrantfile ruby scripts/testing/proxy-fleet-vagrant-config.test.rb',
        'corepack pnpm lint',
        'corepack pnpm typecheck',
        'corepack pnpm test:ci',
        'corepack pnpm test -- identity-schema.integration.spec.ts --runInBand',
        'corepack pnpm test -- credits.service.integration.spec.ts --runInBand',
        'corepack pnpm test -- payment-event.handler.integration.spec.ts --runInBand',
        'corepack pnpm test -- typeorm-stores-organization-isolation.integration.spec.ts --runInBand',
        'corepack pnpm build',
    ],
    web: [
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:ui-audit',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web design:lint',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web ui:audit',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web lint',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web typecheck',
        'corepack pnpm --filter @tuposoft/lead-email-finder-api-client build',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web build',
    ],
    contract: [
        'corepack pnpm openapi:check',
        'node --test scripts/openapi/*.test.mjs',
        'corepack pnpm --filter @tuposoft/lead-email-finder-api-client build',
    ],
    images: [
        'docker build --tag lead-email-finder:ci .',
        `docker run --rm --entrypoint node lead-email-finder:ci
          -e "const { accessSync, constants, readFileSync, statSync } = require('node:fs');
          const { parse } = require('yaml');
          const path = '/app/config/privacy/account-discovery-approvals.yaml';
          const manifest = parse(readFileSync(path, 'utf8'));
          if (manifest.schemaVersion !== 1 || manifest.revision !== 'initial-empty' || manifest.approvals.length !== 0)
          process.exit(1);
          const stat = statSync(path);
          if (stat.uid !== 0 || stat.gid !== 0 || (stat.mode & 0o022) !== 0) process.exit(1);
          try { accessSync(path, constants.W_OK); process.exit(1); }
          catch (error) { if (error.code !== 'EACCES') throw error; }"`,
        'docker build --file docker/Dockerfile --tag lead-email-finder-api:frontend-06 .',
        'docker build --file docker/web.Dockerfile --tag lead-email-finder-web:frontend-06 .',
        'docker compose -f docker/compose.yaml config --quiet',
    ],
    browser: [
        'docker build --file docker/web.Dockerfile --tag lead-email-finder-web:frontend-06 .',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install --with-deps chromium',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:a11y',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:visual',
        'corepack pnpm test:gateway',
        'corepack pnpm dev:reset -- --confirm-project=LEF',
        'corepack pnpm test:web-live',
        'corepack pnpm bruno:bff-sessions',
        'docker compose -f docker/compose.yaml ps',
        'docker compose -f docker/compose.yaml down --volumes',
    ],
}

describe('Validate workflow syntax and structure', () => {
    it('has the stable workflow name, supported events, and exact job inventory', () => {
        expect(workflow.name).toBe('Validate')
        expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'push', 'workflow_dispatch'])
        expect(workflow.permissions).toEqual({ contents: 'read' })
        expect(Object.keys(workflow.jobs).sort()).toEqual([...dependencies, 'validate'].sort())
    })

    it.each([
        ['multiple documents', `${source}\n---\nname: Other`],
        ['non-mapping document', '- item'],
        ['duplicate job IDs', 'jobs:\n  same:\n    steps: []\n  same:\n    steps: []'],
        ['invalid YAML', 'jobs: ['],
        ['invalid step shape', 'jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps: [42]'],
        ['unknown needs', 'jobs:\n  check:\n    runs-on: ubuntu-latest\n    needs: missing\n    steps:\n      - run: echo check'],
        ['run and uses together', 'jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo check\n        uses: actions/checkout@v4'],
        ['non-string run with uses', 'jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: 42\n        uses: actions/checkout@v4'],
        ['non-string job condition', 'jobs:\n  check:\n    if: false\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo check'],
    ])('rejects %s', (_name, yaml) => {
        expect(() => parseWorkflow(yaml)).toThrow()
    })

    it('discovers changes with full history and publishes every classifier flag', () => {
        const discovery = workflow.jobs.changes
        expect(needsOf(discovery)).toEqual([])
        expect(discovery.steps.find((step) => step.uses === 'actions/checkout@v4')?.with?.['fetch-depth']).toBe(0)
        expect(discovery.steps.some((step) => command(step.run) === 'node scripts/ci/select-validation.mjs --event')).toBe(true)
        expect(Object.keys(discovery.outputs ?? {}).sort()).toEqual(Object.values(consumerFlags).sort())
        for (const flag of Object.values(consumerFlags)) {
            const output = condition(discovery.outputs?.[flag])
            const match = /^steps\.([A-Za-z_][A-Za-z0-9_-]*)\.outputs\.(\w+)$/.exec(output)
            expect(match?.[2]).toBe(flag)
            expect(discovery.steps.find((step) => step.id === match?.[1])?.run).toContain('select-validation.mjs --event')
        }
    })

    it.each(Object.entries(consumerFlags))('%s starts unconditionally and has exclusive selected/no-op branches', (id, flag) => {
        const job = workflow.jobs[id]
        expect(needsOf(job)).toEqual(['changes'])
        expect(condition(job.if)).toBe('always()')
        expect(job['continue-on-error']).not.toBe(true)
        const guard = job.steps[0]
        expect(guard.run).toBeDefined()
        expect(guard.if).toBeUndefined()
        expect({ ...job.env, ...guard.env }).toEqual(expect.objectContaining({
            DISCOVERY_RESULT: '${{ needs.changes.result }}',
            VALIDATION_SELECTED: `\${{ needs.changes.outputs.${flag} }}`,
        }))
        const noOps = job.steps.filter((step) => step.name === 'No validation needed')
        expect(noOps).toHaveLength(1)
        expect(condition(noOps[0].if)).toBe(`needs.changes.outputs.${flag} == 'false'`)
        expect(noOps[0].run).toContain('checks were not run')
        for (const step of job.steps.slice(1).filter((step) => step !== noOps[0])) {
            const selected = `needs.changes.outputs.${flag} == 'true'`
            expect([selected, `always() && ${selected}`]).toContain(condition(step.if))
            if (command(step.run) !== 'corepack pnpm docs:lint:changed') {
                expect(step['continue-on-error']).not.toBe(true)
            }
        }
    })

    it.each(Object.entries(preservedCommands))('preserves every prerequisite command in %s', (id, commands) => {
        const actual = workflow.jobs[id].steps.filter((step) => step.run).map((step) => command(step.run))
        for (const expected of commands) {
            expect(actual).toContain(command(expected))
        }
    })

    it('retains the comparison base for documentation, approval, and architecture ratchets', () => {
        const policy = workflow.jobs['repository-policy']
        expect(policy.steps.find((step) => step.uses === 'actions/checkout@v4')?.with?.['fetch-depth']).toBe(0)
        for (const [run, variable] of [
            ['corepack pnpm docs:lint:changed', 'HARPER_BASE_SHA'],
            ['corepack pnpm privacy:account-discovery-approvals-check', 'ACCOUNT_DISCOVERY_APPROVALS_BASE_SHA'],
            ['corepack pnpm architecture:check', 'ARCHITECTURE_BASE_SHA'],
        ]) {
            expect(policy.steps.find((step) => step.run === run)?.env?.[variable]).toBe(
                '${{ github.event.pull_request.base.sha || github.event.before }}',
            )
        }
    })

    it('retains Node 24 and frozen workspace installs for Node validation consumers', () => {
        for (const [id, job] of Object.entries(workflow.jobs).filter(([id]) => id !== 'images')) {
            expect(job.steps.find((step) => step.uses === 'actions/setup-node@v4')?.with?.['node-version']).toBe(24)
            if (id !== 'changes' && id !== 'validate') {
                expect(job.steps.some((step) => command(step.run) === 'corepack enable')).toBe(true)
                expect(job.steps.some((step) => command(step.run).endsWith('install --frozen-lockfile'))).toBe(true)
            }
        }
    })

    it('retains selected PostgreSQL integration wiring without starting PostgreSQL for no-ops', () => {
        const backend = workflow.jobs.backend
        expect(condition(backend.services?.postgres.image)).toBe("needs.changes.outputs.backend == 'true' && 'postgres:18-alpine' || ''")
        expect(backend.services?.postgres.env).toEqual({
            POSTGRES_DB: 'lef_identity_test',
            POSTGRES_USER: 'postgres',
            POSTGRES_PASSWORD: 'postgres',
        })
        for (const [spec, variable] of [
            ['identity-schema.integration.spec.ts', 'TEST_POSTGRES_URL'],
            ['credits.service.integration.spec.ts', 'TEST_CREDITS_POSTGRES_URL'],
            ['payment-event.handler.integration.spec.ts', 'TEST_PAYMENT_WEBHOOK_POSTGRES_URL'],
            ['typeorm-stores-organization-isolation.integration.spec.ts', 'TEST_EMAIL_VERIFICATION_PERSISTENCE_POSTGRES_URL'],
        ]) {
            expect(backend.steps.find((step) => step.run?.includes(spec))?.env?.[variable]).toBe(
                'postgresql://postgres:postgres@localhost:5432/lef_identity_test',
            )
        }
        expect(Object.entries(workflow.jobs).filter(([, job]) => job.services).map(([id]) => id)).toEqual(['backend'])
    })

    it('keeps browser cleanup active after a selected check fails', () => {
        for (const run of ['docker compose -f docker/compose.yaml ps', 'docker compose -f docker/compose.yaml down --volumes']) {
            expect(condition(workflow.jobs.browser.steps.find((step) => command(step.run) === run)?.if)).toBe(
                "always() && needs.changes.outputs.browser == 'true'",
            )
        }
    })

    it('builds and provisions browser prerequisites on the same runner before using them', () => {
        const commands = workflow.jobs.browser.steps.map((step) => command(step.run))
        const before = (prerequisite: string, consumer: string): void => {
            const setupIndex = commands.indexOf(prerequisite)
            expect(setupIndex).toBeGreaterThanOrEqual(0)
            expect(commands.indexOf(consumer)).toBeGreaterThan(setupIndex)
        }
        before(
            'docker build --file docker/web.Dockerfile --tag lead-email-finder-web:frontend-06 .',
            'corepack pnpm test:gateway',
        )
        for (const run of [
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:a11y',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:visual',
            'corepack pnpm test:web-live',
        ]) {
            before('corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install --with-deps chromium', run)
        }
        for (const run of ['corepack pnpm test:web-live', 'corepack pnpm bruno:bff-sessions']) {
            before('corepack pnpm dev:reset -- --confirm-project=LEF', run)
        }
    })

    it('always emits the stable aggregate over discovery and every consumer', () => {
        const summary = workflow.jobs.validate
        expect(summary.name).toBe('validate')
        expect(condition(summary.if)).toBe('always()')
        expect(summary['continue-on-error']).not.toBe(true)
        expect(needsOf(summary).sort()).toEqual([...dependencies].sort())
        const step = summary.steps.find((item) => command(item.run) === 'node scripts/ci/validation-summary.mjs')
        expect(step).toBeDefined()
        expect(step?.if).toBeUndefined()
        expect(step?.['continue-on-error']).not.toBe(true)
        expect(step?.env?.VALIDATION_NEEDS_JSON).toBe('${{ toJSON(needs) }}')
    })
})

describe('consumer discovery guards', () => {
    it.each(Object.keys(consumerFlags))('%s executes a successful no-op without claiming tests ran', (id) => {
        const script = workflow.jobs[id].steps.find((step) => step.name === 'No validation needed')?.run
        expect(script).toBeDefined()
        const execution = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script!], {
            cwd: root,
            encoding: 'utf8',
            timeout: 5000,
            env: { ...process.env, VALIDATION_SELECTED: 'false' },
        })
        expect(execution.error).toBeUndefined()
        expect(execution.status).toBe(0)
        expect(execution.stdout).toContain('selected=false; checks were not run.')
        expect(execution.stderr).toBe('')
    })

    it.each(Object.keys(consumerFlags))('%s accepts only successful discovery with literal boolean flags', (id) => {
        const script = workflow.jobs[id].steps[0].run
        expect(script).toBeDefined()
        for (const [result, selected, expected] of [
            ['success', 'true', 0],
            ['success', 'false', 0],
            ['failure', 'true', 1],
            ['cancelled', 'false', 1],
            ['skipped', 'false', 1],
            ['', 'true', 1],
            ['success', '', 1],
            ['success', 'TRUE', 1],
            ['success', 'null', 1],
        ] as const) {
            const execution = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script!], {
                cwd: root,
                encoding: 'utf8',
                timeout: 5000,
                env: { ...process.env, DISCOVERY_RESULT: result, VALIDATION_SELECTED: selected },
            })
            expect(execution.error).toBeUndefined()
            expect({ result, selected, status: execution.status }).toEqual({ result, selected, status: expected })
        }
    })
})

function runSummary(needs: unknown): ReturnType<typeof spawnSync> {
    return spawnSync(process.execPath, [resolve(root, 'scripts/ci/validation-summary.mjs')], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, VALIDATION_NEEDS_JSON: typeof needs === 'string' ? needs : JSON.stringify(needs) },
    })
}

function successfulNeeds(selected = 'true'): Record<string, { result: string; outputs: Record<string, string> }> {
    return Object.fromEntries(dependencies.map((id) => [id, {
        result: 'success',
        outputs: id === 'changes' ? Object.fromEntries(Object.values(consumerFlags).map((flag) => [flag, selected])) : {},
    }]))
}

describe('validation aggregate fixtures', () => {
    it.each([['selected success', 'true'], ['explicit no-op success', 'false']])('accepts %s', (_name, selected) => {
        const result = runSummary(successfulNeeds(selected))
        expect(result.error).toBeUndefined()
        expect(result.status).toBe(0)
        expect(result.stdout).toBe(`${dependencies.map((id) => `${id}: success`).join('\n')}\n`)
        expect(result.stderr).toBe('')
    })

    it.each(dependencies.flatMap((id) => ['failure', 'cancelled', 'skipped', 'pending', ''].map((result) => [id, result])))(
        'rejects %s with result %s',
        (id, result) => {
            const needs = successfulNeeds()
            needs[id].result = result
            const execution = runSummary(needs)
            expect(execution.status).toBe(1)
            expect(execution.stdout).toBe('')
            expect(execution.stderr).toContain(id)
        },
    )

    it.each(dependencies)('rejects the missing dependency %s', (id) => {
        const needs = successfulNeeds()
        delete needs[id]
        expect(runSummary(needs).status).toBe(1)
    })

    it.each([undefined, null, [], {}, '', '{broken', '{"changes":42}', 'true'])('rejects malformed input %j', (needs) => {
        expect(runSummary(needs).status).toBe(1)
    })

    it('rejects unexpected dependencies even when every supplied result succeeds', () => {
        expect(runSummary({ ...successfulNeeds(), extra: { result: 'success' } }).status).toBe(1)
    })

    it.each([null, 'success', [], {}, { result: true }])('rejects an invalid dependency shape %j', (dependency) => {
        expect(runSummary({ ...successfulNeeds(), backend: dependency }).status).toBe(1)
    })
})
