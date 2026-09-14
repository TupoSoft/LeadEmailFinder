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
    'timeout-minutes'?: number
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
    concurrency: {
        group: string
        'cancel-in-progress': boolean
    }
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
const webPackage: unknown = JSON.parse(readFileSync(resolve(root, 'apps/web/package.json'), 'utf8'))
if (!isRecord(webPackage) || !isRecord(webPackage.scripts)) {
    throw new Error('Expected web package scripts to be a mapping.')
}
const webScripts = webPackage.scripts
const webCommand = 'corepack pnpm --filter @tuposoft/lead-email-finder-web'
const workspaceWebBuild = `${webCommand} build`
const previewSuites = [
    'test:e2e:prebuilt',
    'test:service-clients',
    'test:invitations',
    'test:platform-organizations',
    'test:platform-credits',
    'test:platform-proxies',
    'test:a11y:prebuilt',
    'test:visual:prebuilt',
]

function expectWorkspaceBuildPrerequisite(steps: Step[]): void {
    const builds = steps.filter((step) => command(step.run) === workspaceWebBuild)
    expect(builds).toHaveLength(1)
    const [build] = builds
    expect(condition(build.if)).toBe("needs.changes.outputs.browser == 'true'")
    expect(build['continue-on-error']).not.toBe(true)
    for (const suite of ['test:e2e', 'test:a11y', 'test:visual']) {
        expect(steps.some((step) => command(step.run) === `${webCommand} ${suite}`)).toBe(false)
    }
    for (const suite of previewSuites) {
        const consumers = steps.filter((step) => command(step.run) === `${webCommand} ${suite}`)
        expect(consumers).toHaveLength(1)
        const [consumer] = consumers
        expect(steps.indexOf(consumer)).toBeGreaterThan(steps.indexOf(build))
        // The selection-only condition retains GitHub's implicit success() guard.
        expect(condition(consumer.if)).toBe("needs.changes.outputs.browser == 'true'")
        expect(consumer['continue-on-error']).not.toBe(true)
    }
}

// These are the commands established by the prerequisite plans. Keep complete commands
// here so reorganizing the workflow cannot silently remove a validation or narrow its arguments.
const preservedCommands: Record<string, string[]> = {
    'repository-policy': [
        'corepack pnpm test:docs-lint',
        'corepack pnpm privacy:account-discovery-approvals-check',
        'corepack pnpm security:scan-linkedin-session-material -- --scope=working-tree',
        'corepack pnpm docs:lint:changed',
        'corepack pnpm architecture:check',
        'corepack pnpm test -- select-validation validate-workflow execplan-repository-fixture --runInBand',
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
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:ci --maxWorkers=2',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web build',
    ],
    contract: [
        'corepack pnpm openapi:check',
        'node --test scripts/openapi/*.test.mjs',
        'corepack pnpm --filter @tuposoft/lead-email-finder-api-client build',
    ],
    images: [
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
        'docker compose -f docker/compose.yaml config --quiet',
    ],
    browser: [
        'corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install --with-deps chromium',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web build',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e:prebuilt',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:a11y:prebuilt',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:visual:prebuilt',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-credits',
        'corepack pnpm bruno:platform-credits',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-credits-live',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:proxy-artifacts',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-proxies',
        'corepack pnpm bruno:proxy-registry',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-proxies-live',
        'corepack pnpm test:gateway',
        'corepack pnpm dev:reset -- --confirm-project=LEF',
        'corepack pnpm test:web-live',
        'corepack pnpm bruno:bff-sessions',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:verification-artifacts',
        'corepack pnpm bruno:async-verification',
        'corepack pnpm --filter @tuposoft/lead-email-finder-web test:verification-live',
        'docker compose -f docker/compose.yaml ps',
        'docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml down --volumes --remove-orphans',
    ],
}

describe('Validate workflow syntax and structure', () => {
    it('cancels superseded runs within the same workflow and ref', () => {
        expect(workflow.concurrency).toEqual({
            group: '${{ github.workflow }}-${{ github.ref }}',
            'cancel-in-progress': true,
        })
    })

    it('has the stable workflow name, supported events, and exact job inventory', () => {
        expect(workflow.name).toBe('Validate')
        expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'push', 'workflow_dispatch'])
        expect(workflow.permissions).toEqual({ contents: 'read' })
        expect(Object.keys(workflow.jobs).sort()).toEqual([...dependencies, 'validate'].sort())
    })

    it('allows 90 minutes for the browser baseline', () => {
        expect(workflow.jobs.browser['timeout-minutes']).toBe(90)
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

    it.each(Object.entries(consumerFlags))('%s handles discovery failures unless canceled and has exclusive selected/no-op branches', (id, flag) => {
        const job = workflow.jobs[id]
        expect(needsOf(job)).toEqual(['changes'])
        expect(condition(job.if)).toBe('!cancelled()')
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
            if (command(step.run) !== 'corepack pnpm docs:lint:changed' && step.uses !== 'actions/cache@v4') {
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

    it('retains the comparison base for documentation and approval ratchets', () => {
        const policy = workflow.jobs['repository-policy']
        expect(policy.steps.find((step) => step.uses === 'actions/checkout@v4')?.with?.['fetch-depth']).toBe(0)
        for (const [run, variable] of [
            ['corepack pnpm docs:lint:changed', 'HARPER_BASE_SHA'],
            ['corepack pnpm privacy:account-discovery-approvals-check', 'ACCOUNT_DISCOVERY_APPROVALS_BASE_SHA'],
        ]) {
            expect(policy.steps.find((step) => step.run === run)?.env?.[variable]).toBe(
                '${{ github.event.pull_request.base.sha || github.event.before }}',
            )
        }
    })

    it('runs the architecture check without a comparison base, now that the check is a permanent zero-violation gate', () => {
        const policy = workflow.jobs['repository-policy']
        const step = policy.steps.find((step) => step.run === 'corepack pnpm architecture:check')
        expect(step?.env).toBeUndefined()
    })

    it('keeps the real ExecPlan fixture mandatory when plan-only changes select repository policy', () => {
        const selection = spawnSync(process.execPath, [
            resolve(root, 'scripts/ci/select-validation.mjs'),
            '--paths-json',
            JSON.stringify(['.agents/plans/frontend/07-make-validation-path-aware.md']),
        ], { cwd: root, encoding: 'utf8', timeout: 5000, env: { ...process.env, GITHUB_OUTPUT: undefined } })
        expect(selection.error).toBeUndefined()
        expect(selection.status).toBe(0)
        expect(JSON.parse(selection.stdout)).toEqual({
            repositoryPolicy: true,
            backend: false,
            web: false,
            contract: false,
            images: false,
            browser: false,
        })
        const fixture = workflow.jobs['repository-policy'].steps.find((step) => step.run?.includes('execplan-repository-fixture'))
        expect(fixture).toBeDefined()
        expect(condition(fixture?.if)).toBe("needs.changes.outputs.repositoryPolicy == 'true'")
        expect(fixture?.['continue-on-error']).not.toBe(true)
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

    it.each([
        ['repository-policy', 'api', 'corepack pnpm --filter @tuposoft/lead-email-finder... --filter @tuposoft/lead-email-finder-api-client... install --frozen-lockfile'],
        ['backend', 'api', 'corepack pnpm --filter @tuposoft/lead-email-finder... --filter @tuposoft/lead-email-finder-api-client... install --frozen-lockfile'],
        ['contract', 'api', 'corepack pnpm --filter @tuposoft/lead-email-finder... --filter @tuposoft/lead-email-finder-api-client... install --frozen-lockfile'],
        ['web', 'web', 'corepack pnpm --filter @tuposoft/lead-email-finder-web... install --frozen-lockfile'],
        ['browser', 'workspace', 'corepack pnpm install --frozen-lockfile'],
    ] as const)('%s restores a compatible pnpm store and installs even after a cache miss or restore failure', (id, group, installCommand) => {
        const job = workflow.jobs[id]
        const stores = job.steps.filter((step) => step.id === 'pnpm-store')
        const caches = job.steps.filter((step) => step.uses === 'actions/cache@v4')
        const installs = job.steps.filter((step) => command(step.run) === installCommand)
        expect(stores).toHaveLength(1)
        expect(caches).toHaveLength(1)
        expect(installs).toHaveLength(1)
        const [store] = stores
        const [cache] = caches
        const [install] = installs
        const corepackIndex = job.steps.findIndex((step) => command(step.run) === 'corepack enable')
        const nodeIndex = job.steps.findIndex((step) => step.uses === 'actions/setup-node@v4')
        expect(nodeIndex).toBeGreaterThanOrEqual(0)
        expect(corepackIndex).toBeGreaterThan(nodeIndex)
        expect(job.steps.indexOf(store)).toBeGreaterThan(corepackIndex)
        expect(job.steps.indexOf(cache)).toBeGreaterThan(job.steps.indexOf(store))
        expect(job.steps.indexOf(install)).toBeGreaterThan(job.steps.indexOf(cache))
        const prefix = `\${{ runner.os }}-\${{ runner.arch }}-node24-pnpm\${{ steps.pnpm-store.outputs.version }}-${group}-`
        expect(cache.with?.path).toBe('${{ steps.pnpm-store.outputs.path }}')
        expect(cache.with?.key).toBe(`${prefix}\${{ hashFiles('pnpm-lock.yaml') }}`)
        expect(String(cache.with?.['restore-keys']).trim().split('\n')).toEqual([prefix])
        expect(cache.with?.['fail-on-cache-miss']).not.toBe(true)
        expect(cache['continue-on-error']).toBe(true)
        expect(install['continue-on-error']).not.toBe(true)
        // Neither a successful restore nor a miss may bypass the authoritative install.
        expect(condition(install.if)).toBe(`needs.changes.outputs.${consumerFlags[id]} == 'true'`)

        const execution = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', `
            GITHUB_OUTPUT="$(mktemp)"
            trap 'rm -f "$GITHUB_OUTPUT"' EXIT
            corepack() {
                case "$*" in
                    'pnpm store path --silent') printf '%s\\n' '/tmp/custom pnpm/store/v10' ;;
                    'pnpm --version') printf '%s\\n' '10.33.0' ;;
                    *) return 1 ;;
                esac
            }
            ${store.run}
            cat "$GITHUB_OUTPUT"
        `], { cwd: root, encoding: 'utf8', timeout: 5000, env: { ...process.env, GITHUB_OUTPUT: undefined } })
        expect(execution.error).toBeUndefined()
        expect(execution.stderr).toBe('')
        expect(execution.status).toBe(0)
        expect(execution.stdout).toBe('path=/tmp/custom pnpm/store/v10\nversion=10.33.0\n')
    })

    it('does not cache dependencies in jobs that do not install them', () => {
        for (const id of ['changes', 'images', 'validate']) {
            expect(workflow.jobs[id].steps.some((step) => step.uses === 'actions/cache@v4' || step.id === 'pnpm-store')).toBe(false)
        }
    })

    it.each(['images', 'browser'] as const)('%s loads each image locally with an independent shared cache and mandatory build', (id) => {
        const job = workflow.jobs[id]
        const setups = job.steps.filter((step) => step.uses === 'docker/setup-buildx-action@v4')
        const builds = job.steps.filter((step) => step.uses === 'docker/build-push-action@v7')
        const expected = id === 'images'
            ? [
                ['Dockerfile', 'lead-email-finder:ci', 'lef-production'],
                ['docker/Dockerfile', 'lead-email-finder-api:frontend-06', 'lef-api'],
                ['docker/web.Dockerfile', 'lead-email-finder-web:frontend-06', 'lef-web'],
            ]
            : [['docker/web.Dockerfile', 'lead-email-finder-web:frontend-06', 'lef-web']]
        expect(setups).toHaveLength(1)
        const [setup] = setups
        expect(setup.id).toBe('buildx')
        expect(setup.with?.driver).toBe('docker-container')
        // Nested Compose builds retain their existing Docker builder.
        expect(setup.with?.use).toBe(false)
        expect(job.steps.indexOf(setup)).toBeGreaterThan(job.steps.findIndex((step) => step.uses === 'actions/checkout@v4'))
        expect(builds).toHaveLength(expected.length)
        expect(job.env?.DOCKER_BUILD_RECORD_UPLOAD).toBe('false')
        for (const [file, tags, scope] of expected) {
            const matching = builds.filter((step) => step.with?.file === file)
            expect(matching).toHaveLength(1)
            const [build] = matching
            expect(job.steps.indexOf(build)).toBeGreaterThan(job.steps.indexOf(setup))
            expect(build.with).toEqual(expect.objectContaining({
                builder: '${{ steps.buildx.outputs.name }}',
                context: '.',
                tags,
                load: true,
                push: false,
                'cache-from': `type=gha,version=2,scope=${scope}`,
                'cache-to': `type=gha,version=2,scope=${scope},mode=max,ignore-error=true`,
            }))
            expect(condition(build.if)).toBe(`needs.changes.outputs.${id} == 'true'`)
            expect(build['continue-on-error']).not.toBe(true)
            expect(build.with?.['no-cache']).not.toBe(true)
        }
        if (id === 'images') {
            const productionIndex = job.steps.findIndex((step) => step.with?.tags === 'lead-email-finder:ci')
            expect(job.steps.findIndex((step) => step.run?.startsWith('docker run --rm --entrypoint node lead-email-finder:ci')))
                .toBeGreaterThan(productionIndex)
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

    it('keeps browser cleanup active after a selected check fails or is canceled', () => {
        for (const run of ['docker compose -f docker/compose.yaml ps', 'docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml down --volumes --remove-orphans']) {
            expect(condition(workflow.jobs.browser.steps.find((step) => command(step.run) === run)?.if)).toBe(
                "always() && needs.changes.outputs.browser == 'true'",
            )
        }
    })

    it('retains local API watch mode and the same startup override with the SMTP overlay', () => {
        const compose = parseAllDocuments(readFileSync(resolve(root, 'docker/compose.yaml'), 'utf8'))
        const smtp = parseAllDocuments(readFileSync(resolve(root, 'docker/compose.smtp-dev.yaml'), 'utf8'))
        for (const documents of [compose, smtp]) {
            expect(documents).toHaveLength(1)
            expect(documents[0].errors).toEqual([])
        }
        expect(compose[0].getIn(['services', 'api', 'command'])).toBe('${API_START_COMMAND:-pnpm start}')
        expect(smtp[0].hasIn(['services', 'api', 'command'])).toBe(false)
        const packageJson: unknown = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
        if (!isRecord(packageJson) || !isRecord(packageJson.scripts)) {
            throw new Error('Expected package scripts to be a mapping.')
        }
        expect(packageJson.scripts.start).toBe('nest start -w')
    })

    it('disables API watch mode throughout both browser CI stack starts', () => {
        const browser = workflow.jobs.browser
        expect(browser.env?.API_START_COMMAND).toBe('pnpm exec nest start')
        for (const start of [
            'corepack pnpm dev:reset -- --confirm-project=LEF',
            'docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d',
        ]) {
            const steps = browser.steps.filter((step) => step.run?.split('\n').some((line) => command(line) === start))
            expect(steps).toHaveLength(1)
            expect({ ...browser.env, ...steps[0].env }.API_START_COMMAND).toBe('pnpm exec nest start')
        }
    })

    it('builds and provisions browser prerequisites on the same runner before using them', () => {
        const steps = workflow.jobs.browser.steps
        const commands = steps.map((step) => command(step.run))
        const before = (prerequisite: string, consumer: string): void => {
            const setupIndex = commands.indexOf(prerequisite)
            expect(setupIndex).toBeGreaterThanOrEqual(0)
            expect(commands.indexOf(consumer)).toBeGreaterThan(setupIndex)
        }
        const webBuildIndex = steps.findIndex((step) => step.uses === 'docker/build-push-action@v7'
            && step.with?.tags === 'lead-email-finder-web:frontend-06')
        expect(webBuildIndex).toBeGreaterThanOrEqual(0)
        expect(commands.indexOf('corepack pnpm test:gateway')).toBeGreaterThan(webBuildIndex)
        for (const run of [
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:e2e:prebuilt',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:a11y:prebuilt',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:visual:prebuilt',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-credits',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-credits-live',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:proxy-artifacts',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-proxies',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-proxies-live',
            'corepack pnpm test:web-live',
        ]) {
            before('corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright install --with-deps chromium', run)
        }
        for (const run of ['corepack pnpm test:web-live', 'corepack pnpm bruno:bff-sessions']) {
            before('corepack pnpm dev:reset -- --confirm-project=LEF', run)
        }
        for (const run of [
            'corepack pnpm bruno:platform-credits',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-credits-live',
            'corepack pnpm bruno:proxy-registry',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-proxies-live',
        ]) {
            before('corepack pnpm dev:reset -- --confirm-project=LEF', run)
            before('corepack pnpm --filter @tuposoft/lead-email-finder-web browser-fixtures:bootstrap', run)
        }
        expectWorkspaceBuildPrerequisite(steps)
        for (const run of [
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-proxies',
            'corepack pnpm --filter @tuposoft/lead-email-finder-web test:platform-proxies-live',
        ]) {
            before('corepack pnpm --filter @tuposoft/lead-email-finder-web test:proxy-artifacts', run)
        }
    })

    it('emits the stable aggregate over discovery and every consumer unless canceled', () => {
        const summary = workflow.jobs.validate
        expect(summary.name).toBe('validate')
        expect(condition(summary.if)).toBe('!cancelled()')
        expect(summary['continue-on-error']).not.toBe(true)
        expect(needsOf(summary).sort()).toEqual([...dependencies].sort())
        const step = summary.steps.find((item) => command(item.run) === 'node scripts/ci/validation-summary.mjs')
        expect(step).toBeDefined()
        expect(step?.if).toBeUndefined()
        expect(step?.['continue-on-error']).not.toBe(true)
        expect(step?.env?.VALIDATION_NEEDS_JSON).toBe('${{ toJSON(needs) }}')
    })
})

describe('browser workspace build reuse', () => {
    it.each([
        'missing build',
        'late build',
        'duplicate build',
        'standalone suite rebuild',
        'ignored build failure',
        'unconditional build',
        'consumer after failure',
    ])('rejects the prerequisite regression: %s', (regression) => {
        const steps = workflow.jobs.browser.steps.map((step) => ({ ...step }))
        const buildIndex = steps.findIndex((step) => command(step.run) === workspaceWebBuild)
        const build = steps[buildIndex]
        switch (regression) {
            case 'missing build':
                steps.splice(buildIndex, 1)
                break
            case 'late build':
                steps.push(...steps.splice(buildIndex, 1))
                break
            case 'duplicate build':
                steps.push({ ...build })
                break
            case 'standalone suite rebuild':
                steps.push({ ...build, run: `${webCommand} test:e2e` })
                break
            case 'ignored build failure':
                build['continue-on-error'] = true
                break
            case 'unconditional build':
                build.if = "always() && needs.changes.outputs.browser == 'true'"
                break
            case 'consumer after failure':
                steps.find((step) => command(step.run) === `${webCommand} test:e2e:prebuilt`)!.if =
                    "always() && needs.changes.outputs.browser == 'true'"
                break
        }
        expect(() => expectWorkspaceBuildPrerequisite(steps)).toThrow()
    })

    it.each([
        ['test:e2e', 'playwright test tests/e2e/public-entry.spec.ts tests/e2e/not-found.spec.ts tests/e2e/auth-shell.spec.ts tests/e2e/billing-ui.spec.ts tests/e2e/team-ui.spec.ts tests/e2e/verification-ui.spec.ts tests/e2e/batch-verification-ui.spec.ts'],
        ['test:a11y', 'playwright test tests/e2e/accessibility.spec.ts'],
        ['test:visual', 'playwright test tests/e2e/visual.spec.ts'],
    ])('%s retains its selectors and builds before delegating to the prebuilt suite', (suite, selector) => {
        expect(webScripts[`${suite}:prebuilt`]).toBe(selector)
        expect(webScripts[suite]).toBe(`pnpm build && pnpm ${suite}:prebuilt`)
        for (const [buildExit, suiteExit, expectedExit] of [[0, 0, 0], [23, 0, 23], [0, 17, 17]]) {
            const execution = spawnSync('bash', ['--noprofile', '--norc', '-c', `
                pnpm() {
                    printf '%s\\n' "$*"
                    if [ "$1" = build ]; then return "$BUILD_EXIT"; fi
                    return "$SUITE_EXIT"
                }
                ${String(webScripts[suite])}
            `], {
                cwd: root,
                encoding: 'utf8',
                timeout: 5000,
                env: { ...process.env, BUILD_EXIT: String(buildExit), SUITE_EXIT: String(suiteExit) },
            })
            expect(execution.error).toBeUndefined()
            expect(execution.status).toBe(expectedExit)
            expect(execution.stderr).toBe('')
            expect(execution.stdout).toBe(buildExit === 0 ? `build\n${suite}:prebuilt\n` : 'build\n')
        }
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
