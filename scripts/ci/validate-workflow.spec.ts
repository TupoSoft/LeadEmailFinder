import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
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
const browserWorkers = ['browser-artifacts', 'browser-ui', 'browser-live'] as const
const browserDependencies = ['changes', ...browserWorkers]
const executableFlags: Record<string, string> = {
    ...Object.fromEntries(Object.entries(consumerFlags).filter(([id]) => id !== 'browser')),
    ...Object.fromEntries(browserWorkers.map((id) => [id, 'browser'])),
}

interface Step {
    id?: string
    name?: string
    if?: string
    run?: string
    uses?: string
    env?: Record<string, string>
    with?: Record<string, unknown>
    'timeout-minutes'?: number
    'continue-on-error'?: boolean
}

interface Job {
    name?: string
    'runs-on': string | string[]
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
        const runner = job['runs-on']
        if (
            !(
                (typeof runner === 'string' && runner.trim() !== '') ||
                (Array.isArray(runner) && runner.length > 0 && runner.every((label) => typeof label === 'string' && label.trim() !== ''))
            ) ||
            job.steps.length === 0
        ) {
            throw new Error('Every job must declare a runner and at least one step.')
        }
        if (job['timeout-minutes'] !== undefined && (!Number.isInteger(job['timeout-minutes']) || Number(job['timeout-minutes']) <= 0)) {
            throw new Error('Job timeouts must be positive integers.')
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
            if (step['timeout-minutes'] !== undefined && (!Number.isInteger(step['timeout-minutes']) || Number(step['timeout-minutes']) <= 0)) {
                throw new Error('Step timeouts must be positive integers.')
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
const chromiumInstall = `${webCommand} exec playwright install --with-deps chromium`
const smtpAttachment = `docker compose -f docker/compose.yaml down
    docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml up -d
    verification_bootstrap=$(docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml ps -aq smtp-dev-proxy-bootstrap)
    test -n "$verification_bootstrap"
    verification_bootstrap_exit=$(timeout 120s docker wait "$verification_bootstrap")
    test "$verification_bootstrap_exit" = 0`
const healthReport = 'docker compose -f docker/compose.yaml ps'
const stackCleanup = 'docker compose -f docker/compose.yaml -f docker/compose.smtp-dev.yaml down --volumes --remove-orphans'
const browserCommands: Record<(typeof browserWorkers)[number], string[]> = {
    'browser-artifacts': [
        'test:privileged-artifacts',
        'test:invitation-artifacts',
        'test:verification-artifacts',
        'test:service-client-artifacts',
        'test:proxy-artifacts',
    ].map((suite) => `${webCommand} ${suite}`),
    'browser-ui': [workspaceWebBuild, ...previewSuites.map((suite) => `${webCommand} ${suite}`)],
    'browser-live': [
        'corepack pnpm test:gateway',
        'corepack pnpm dev:reset -- --confirm-project=LEF',
        'corepack pnpm test:web-live',
        'corepack pnpm bruno:bff-sessions',
        `${webCommand} browser-fixtures:bootstrap`,
        'corepack pnpm bruno:organization-onboarding',
        `${webCommand} test:platform-organizations-live`,
        'corepack pnpm bruno:platform-credits',
        `${webCommand} test:platform-credits-live`,
        'corepack pnpm bruno:proxy-registry',
        `${webCommand} test:platform-proxies-live`,
        `${webCommand} test:team-live`,
        'corepack pnpm bruno:service-client-rejections',
        `${webCommand} test:service-clients-live`,
        smtpAttachment,
        'corepack pnpm bruno:async-verification',
        `${webCommand} test:verification-live`,
        'corepack pnpm bruno:batch-verification',
        `${webCommand} test:batch-verification-live`,
        healthReport,
        stackCleanup,
    ],
}

function expectBrowserInventory(jobs: Record<string, Job>, id: (typeof browserWorkers)[number]): void {
    const steps = jobs[id].steps
    const chromium = steps.filter((step) => command(step.run) === chromiumInstall)
    expect(chromium).toHaveLength(1)
    const actual = steps.slice(steps.indexOf(chromium[0]) + 1).filter((step) => step.run)
    expect(actual.map((step) => command(step.run))).toEqual(browserCommands[id].map(command))
    for (const step of actual) {
        expect(step.name).toEqual(expect.any(String))
        expect(step['continue-on-error']).not.toBe(true)
    }
    const allCommands = [...browserWorkers, 'browser'].flatMap((worker) => jobs[worker].steps.map((step) => command(step.run)))
    for (const expected of browserCommands[id]) {
        expect(allCommands.filter((run) => run === command(expected))).toHaveLength(1)
    }
}

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
        'corepack pnpm test -- select-validation validate-workflow build-workflow execplan-repository-fixture --runInBand',
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
}

describe('Validate workflow syntax and structure', () => {
    it.each(readdirSync(resolve(root, '.github/workflows')).filter((file) => /\.ya?ml$/.test(file)))(
        '%s routes every job to the ARC scale set',
        (file) => {
            const declared = parseWorkflow(readFileSync(resolve(root, '.github/workflows', file), 'utf8'))
            for (const job of Object.values(declared.jobs)) {
                expect(job['runs-on']).toBe('tuposoft-pc-wsl')
            }
        },
    )

    it.each(['images', 'browser-live'])('%s provisions Compose before starting Docker builds or services', (id) => {
        const steps = workflow.jobs[id].steps
        const composeIndex = steps.findIndex((step) => step.uses === 'docker/setup-compose-action@v2')
        const buildxIndex = steps.findIndex((step) => step.uses === 'docker/setup-buildx-action@v4')
        expect(composeIndex).toBeGreaterThanOrEqual(0)
        expect(buildxIndex).toBeGreaterThan(composeIndex)
    })

    it('prepares the fixed Ruby cache and runtime libraries before setting up Ruby', () => {
        const steps = workflow.jobs.backend.steps
        const setupIndex = steps.findIndex((step) => step.uses === 'ruby/setup-ruby@v1')
        expect(setupIndex).toBeGreaterThan(0)
        const preparation = steps.slice(0, setupIndex).map((step) => step.run ?? '').join('\n')
        expect(preparation).toContain('sudo apt-get install --no-install-recommends -y libyaml-0-2 libgmp10')
        expect(preparation).toContain('sudo install -d -o "$(id -u)" -g "$(id -g)" /opt/hostedtoolcache')
    })

    it('installs GitHub CLI before the ExecPlan synchronizer invokes it', () => {
        const sync = parseWorkflow(readFileSync(resolve(root, '.github/workflows/sync-execplans.yml'), 'utf8'))
        const steps = sync.jobs.sync.steps
        const installationIndex = steps.findIndex((step) => step.run?.includes('apt-get install --no-install-recommends -y gh'))
        const syncIndex = steps.findIndex((step) => step.run === 'corepack pnpm plans:sync')
        expect(installationIndex).toBeGreaterThanOrEqual(0)
        expect(syncIndex).toBeGreaterThan(installationIndex)
        expect(steps[installationIndex].if).toBeUndefined()
        expect(steps[installationIndex]['continue-on-error']).not.toBe(true)
    })

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
        expect(Object.keys(workflow.jobs).sort()).toEqual([...dependencies, ...browserWorkers, 'validate'].sort())
    })

    it('declares bounded independent browser workers and a lightweight aggregate', () => {
        for (const [id, budget] of [['browser-artifacts', 15], ['browser-ui', 20], ['browser-live', 25]] as const) {
            expect(workflow.jobs[id]['timeout-minutes']).toBe(budget)
        }
        expect(workflow.jobs.browser['timeout-minutes']).toBe(10)
        for (const id of [...browserWorkers, 'browser']) {
            expect(workflow.jobs[id]['runs-on']).toBe('tuposoft-pc-wsl')
        }
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
        ['empty runner labels', 'jobs:\n  check:\n    runs-on: []\n    steps:\n      - run: echo check'],
        ['non-string runner labels', 'jobs:\n  check:\n    runs-on: [self-hosted, 42]\n    steps:\n      - run: echo check'],
        ...[0, -1, 1.5, '"90"'].flatMap((timeout) => [
            [`invalid job timeout ${timeout}`, `jobs:\n  check:\n    runs-on: ubuntu-latest\n    timeout-minutes: ${timeout}\n    steps:\n      - run: echo check`],
            [`invalid step timeout ${timeout}`, `jobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo check\n        timeout-minutes: ${timeout}`],
        ]),
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

    it.each(Object.entries(executableFlags))('%s rejects failed discovery and has exclusive selected/no-op branches', (id, flag) => {
        const job = workflow.jobs[id]
        const dependent = id === 'browser-ui' || id === 'browser-live'
        expect(needsOf(job)).toEqual(dependent ? ['changes', 'browser-artifacts'] : ['changes'])
        expect(condition(job.if)).toBe('!cancelled()')
        expect(job['continue-on-error']).not.toBe(true)
        const guard = job.steps[0]
        expect(guard.run).toBeDefined()
        expect(guard.if).toBeUndefined()
        expect(guard['continue-on-error']).not.toBe(true)
        expect({ ...job.env, ...guard.env }).toEqual(expect.objectContaining({
            DISCOVERY_RESULT: '${{ needs.changes.result }}',
            VALIDATION_SELECTED: `\${{ needs.changes.outputs.${flag} }}`,
        }))
        const noOps = job.steps.filter((step) => step.name === 'No validation needed')
        expect(noOps).toHaveLength(1)
        expect(condition(noOps[0].if)).toBe(`needs.changes.outputs.${flag} == 'false'`)
        expect(noOps[0].run).toContain('checks were not run')
        expect(noOps[0]['continue-on-error']).not.toBe(true)
        const prerequisite = dependent ? job.steps[1] : undefined
        if (prerequisite) {
            expect(prerequisite.if).toBeUndefined()
            expect(prerequisite.run).toBeDefined()
            expect(prerequisite['continue-on-error']).not.toBe(true)
            expect({ ...job.env, ...prerequisite.env }.BROWSER_ARTIFACTS_RESULT).toBe('${{ needs.browser-artifacts.result }}')
        }
        for (const step of job.steps.slice(1).filter((step) => step !== noOps[0] && step !== prerequisite)) {
            const selected = `needs.changes.outputs.${flag} == 'true'`
            const cleanup = id === 'browser-live' && [healthReport, stackCleanup].includes(command(step.run))
            expect(condition(step.if)).toBe(cleanup
                ? `always() && ${selected} && steps.browser-live-checkout.outcome == 'success'`
                : selected)
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
            if (Object.hasOwn(executableFlags, id)) {
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
        ...browserWorkers.map((id) => [id, 'workspace', 'corepack pnpm install --frozen-lockfile'] as const),
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
        expect(condition(install.if)).toBe(`needs.changes.outputs.${executableFlags[id]} == 'true'`)

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
        for (const id of ['changes', 'images', 'browser', 'validate']) {
            expect(workflow.jobs[id].steps.some((step) => step.uses === 'actions/cache@v4' || step.id === 'pnpm-store')).toBe(false)
        }
    })

    it.each(['images', 'browser-live'] as const)('%s loads each image locally with an independent shared cache and mandatory build', (id) => {
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
            expect(condition(build.if)).toBe(`needs.changes.outputs.${executableFlags[id]} == 'true'`)
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

    it('bounds health reporting and cleanup after checkout, including failed selected work', () => {
        const live = workflow.jobs['browser-live']
        const checkout = live.steps.find((step) => step.id === 'browser-live-checkout')
        expect(checkout?.uses).toBe('actions/checkout@v4')
        expect(condition(checkout?.if)).toBe("needs.changes.outputs.browser == 'true'")
        for (const run of [healthReport, stackCleanup]) {
            const step = live.steps.find((item) => command(item.run) === run)
            expect(step).toBeDefined()
            expect(condition(step?.if)).toBe(
                "always() && needs.changes.outputs.browser == 'true' && steps.browser-live-checkout.outcome == 'success'",
            )
            expect(step?.['timeout-minutes']).toBe(5)
            expect(step?.['continue-on-error']).not.toBe(true)
            // Evaluate the workflow's condition for selected failure, no-op, and early failure paths.
            for (const [selected, checkoutOutcome, expected] of [
                ['true', 'success', true],
                ['false', 'success', false],
                ['false', 'skipped', false],
                ['true', 'skipped', false],
                ['true', 'failure', false],
                ['true', 'cancelled', false],
            ] as const) {
                const expression = condition(step?.if)
                    .replace('always()', 'true')
                    .replace('needs.changes.outputs.browser', JSON.stringify(selected))
                    .replace('steps.browser-live-checkout.outcome', JSON.stringify(checkoutOutcome))
                const execution = spawnSync('bash', ['--noprofile', '--norc', '-c', `if [[ ${expression} ]]; then echo run; else echo skip; fi`], {
                    encoding: 'utf8',
                    timeout: 5000,
                })
                expect(execution.error).toBeUndefined()
                expect(execution.status).toBe(0)
                expect(execution.stderr).toBe('')
                expect(execution.stdout).toBe(expected ? 'run\n' : 'skip\n')
            }
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
        const browser = workflow.jobs['browser-live']
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

    it.each(browserWorkers)('%s preserves the complete ordered inventory with exclusive suite ownership', (id) => {
        expectBrowserInventory(workflow.jobs, id)
        const job = workflow.jobs[id]
        const checkout = job.steps.find((step) => step.uses === 'actions/checkout@v4')
        expect(checkout?.with?.['fetch-depth']).toBe(0)
        const installIndex = job.steps.findIndex((step) => command(step.run) === 'corepack pnpm install --frozen-lockfile')
        const chromiumIndex = job.steps.findIndex((step) => command(step.run) === chromiumInstall)
        expect(installIndex).toBeGreaterThanOrEqual(0)
        expect(chromiumIndex).toBeGreaterThan(installIndex)
        if (id !== 'browser-live') {
            expect(job.env?.API_START_COMMAND).toBeUndefined()
            expect(job.steps.some((step) => step.uses?.startsWith('docker/') || step.run?.includes('docker '))).toBe(false)
        }
    })

    it('builds and provisions browser prerequisites on their owning isolated workers', () => {
        const steps = workflow.jobs['browser-live'].steps
        const commands = steps.map((step) => command(step.run))
        const before = (prerequisite: string, consumer: string): void => {
            const setupIndex = commands.indexOf(command(prerequisite))
            expect(setupIndex).toBeGreaterThanOrEqual(0)
            expect(commands.indexOf(command(consumer))).toBeGreaterThan(setupIndex)
        }
        const webBuildIndex = steps.findIndex((step) => step.uses === 'docker/build-push-action@v7'
            && step.with?.tags === 'lead-email-finder-web:frontend-06')
        expect(webBuildIndex).toBeGreaterThanOrEqual(0)
        expect(commands.indexOf('corepack pnpm test:gateway')).toBeGreaterThan(webBuildIndex)
        for (const run of browserCommands['browser-live'].slice(2)) {
            before('corepack pnpm dev:reset -- --confirm-project=LEF', run)
        }
        for (const run of browserCommands['browser-live'].slice(5)) {
            before(`${webCommand} browser-fixtures:bootstrap`, run)
        }
        for (const run of [
            'corepack pnpm bruno:async-verification',
            `${webCommand} test:verification-live`,
            'corepack pnpm bruno:batch-verification',
            `${webCommand} test:batch-verification-live`,
        ]) {
            before(smtpAttachment, run)
        }
        expectWorkspaceBuildPrerequisite(workflow.jobs['browser-ui'].steps)
    })

    it('requires every browser worker through a lightweight fail-closed aggregate', () => {
        const summary = workflow.jobs.browser
        expect(condition(summary.if)).toBe('!cancelled()')
        expect(needsOf(summary)).toEqual(browserDependencies)
        expect(summary['continue-on-error']).not.toBe(true)
        expect(summary.steps).toHaveLength(3)
        expect(summary.steps[0].uses).toBe('actions/checkout@v4')
        expect(summary.steps[0].with?.['fetch-depth']).toBe(0)
        expect(summary.steps[1].uses).toBe('actions/setup-node@v4')
        expect(summary.steps[1].with?.['node-version']).toBe(24)
        const step = summary.steps[2]
        expect(command(step.run)).toBe('node scripts/ci/browser-summary.mjs')
        expect(step.env?.BROWSER_NEEDS_JSON).toBe('${{ toJSON(needs) }}')
        for (const item of summary.steps) {
            expect(item.if).toBeUndefined()
            expect(item['continue-on-error']).not.toBe(true)
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
    it.each(['missing suite', 'duplicate suite', 'suite moved to another worker', 'changed arguments', 'suite before Chromium'])('rejects inventory regression: %s', (regression) => {
        const jobs = Object.fromEntries(Object.entries(workflow.jobs).map(([id, job]) => [id, {
            ...job,
            steps: job.steps.map((step) => ({ ...step })),
        }]))
        const steps = jobs['browser-artifacts'].steps
        const suiteIndex = steps.findIndex((step) => command(step.run) === `${webCommand} test:proxy-artifacts`)
        const suite = steps[suiteIndex]
        switch (regression) {
            case 'missing suite':
                steps.splice(suiteIndex, 1)
                break
            case 'duplicate suite':
                jobs['browser-ui'].steps.push({ ...suite })
                break
            case 'suite moved to another worker':
                jobs['browser-ui'].steps.push(...steps.splice(suiteIndex, 1))
                break
            case 'changed arguments':
                suite.run += ' --grep smoke'
                break
            case 'suite before Chromium':
                steps.unshift(...steps.splice(suiteIndex, 1))
                break
        }
        expect(() => expectBrowserInventory(jobs, 'browser-artifacts')).toThrow()
    })

    it.each([
        'missing build',
        'late build',
        'duplicate build',
        'standalone suite rebuild',
        'ignored build failure',
        'unconditional build',
        'consumer after failure',
    ])('rejects the prerequisite regression: %s', (regression) => {
        const steps = workflow.jobs['browser-ui'].steps.map((step) => ({ ...step }))
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
    it.each(Object.keys(executableFlags))('%s executes a successful no-op without claiming tests ran', (id) => {
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

    it.each(Object.keys(executableFlags))('%s accepts only successful discovery with literal boolean flags', (id) => {
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

describe('browser worker prerequisite guards', () => {
    it('carries a documentation-only selection through explicit worker no-ops and both aggregates', () => {
        const selection = spawnSync(process.execPath, [
            resolve(root, 'scripts/ci/select-validation.mjs'),
            '--paths-json',
            JSON.stringify(['.agents/plans/browser-ci/03-separate-browser-validation.md']),
        ], { cwd: root, encoding: 'utf8', timeout: 5000, env: { ...process.env, GITHUB_OUTPUT: undefined } })
        expect(selection.error).toBeUndefined()
        expect(selection.status).toBe(0)
        const flags: unknown = JSON.parse(selection.stdout)
        expect(flags).toEqual({ repositoryPolicy: true, backend: false, web: false, contract: false, images: false, browser: false })
        const needs = successfulBrowserNeeds('false')
        for (const id of browserWorkers) {
            const job = workflow.jobs[id]
            const guardCount = id === 'browser-artifacts' ? 1 : 2
            const noOp = job.steps.find((step) => step.name === 'No validation needed')!
            const script = [...job.steps.slice(0, guardCount), noOp].map((step) => step.run).join('\n')
            const execution = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
                cwd: root,
                encoding: 'utf8',
                timeout: 5000,
                env: { ...process.env, DISCOVERY_RESULT: 'success', VALIDATION_SELECTED: 'false', BROWSER_ARTIFACTS_RESULT: 'success' },
            })
            expect(execution.error).toBeUndefined()
            expect(execution.status).toBe(0)
            expect(execution.stdout).toBe(`${id}: selected=false; checks were not run.\n`)
            needs[id].result = execution.status === 0 ? 'success' : 'failure'
        }
        const browser = runBrowserSummary(needs)
        expect(browser.status).toBe(0)
        expect(browser.stdout).toBe('browser: selected=false; checks were not run.\n')
        const finalNeeds = successfulNeeds('false')
        finalNeeds.changes.outputs.repositoryPolicy = 'true'
        finalNeeds.browser.result = browser.status === 0 ? 'success' : 'failure'
        expect(runSummary(finalNeeds).status).toBe(0)
    })

    it.each(['browser-ui', 'browser-live'])('%s rejects unsuccessful artifacts before any selected or no-op work', (id) => {
        const job = workflow.jobs[id]
        const scripts = job.steps.slice(0, 2).map((step) => step.run).join('\n')
        for (const selected of ['true', 'false']) {
            for (const result of ['success', 'failure', 'cancelled', 'skipped', 'pending', '', 'SUCCESS', undefined]) {
                const execution = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', `${scripts}\necho work-reached`], {
                    cwd: root,
                    encoding: 'utf8',
                    timeout: 5000,
                    env: {
                        ...process.env,
                        DISCOVERY_RESULT: 'success',
                        VALIDATION_SELECTED: selected,
                        BROWSER_ARTIFACTS_RESULT: result,
                    },
                })
                expect(execution.error).toBeUndefined()
                expect({ selected, result, status: execution.status }).toEqual({ selected, result, status: result === 'success' ? 0 : 1 })
                expect(execution.stdout.includes('work-reached')).toBe(result === 'success')
            }
        }
    })

    it.each(browserWorkers)('%s fails discovery before selected work even if artifacts succeeded', (id) => {
        const job = workflow.jobs[id]
        const guardCount = id === 'browser-artifacts' ? 1 : 2
        const script = `${job.steps.slice(0, guardCount).map((step) => step.run).join('\n')}\necho work-reached`
        for (const [discovery, selected] of [['failure', 'true'], ['cancelled', 'false'], ['skipped', 'false'], ['', 'true'], ['success', ''], ['success', 'TRUE']]) {
            const execution = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
                cwd: root,
                encoding: 'utf8',
                timeout: 5000,
                env: { ...process.env, DISCOVERY_RESULT: discovery, VALIDATION_SELECTED: selected, BROWSER_ARTIFACTS_RESULT: 'success' },
            })
            expect(execution.error).toBeUndefined()
            expect(execution.status).toBe(1)
            expect(execution.stdout).not.toContain('work-reached')
        }
    })
})

function runBrowserSummary(needs: unknown): ReturnType<typeof spawnSync> {
    return spawnSync(process.execPath, [resolve(root, 'scripts/ci/browser-summary.mjs')], {
        encoding: 'utf8',
        timeout: 5000,
        env: { ...process.env, BROWSER_NEEDS_JSON: typeof needs === 'string' ? needs : JSON.stringify(needs) },
    })
}

function successfulBrowserNeeds(selected = 'true'): Record<string, { result: string; outputs: Record<string, string> }> {
    return Object.fromEntries(browserDependencies.map((id) => {
        const outputs: Record<string, string> = id === 'changes' ? { browser: selected, backend: 'false' } : {}
        return [id, { result: 'success', outputs }]
    }))
}

describe('browser aggregate fixtures', () => {
    it.each(['true', 'false'])('accepts successful workers with browser=%s', (selected) => {
        const execution = runBrowserSummary(successfulBrowserNeeds(selected))
        expect(execution.error).toBeUndefined()
        expect(execution.status).toBe(0)
        expect(execution.stderr).toBe('')
        expect(execution.stdout).toBe(selected === 'true'
            ? `${browserDependencies.map((id) => `${id}: success`).join('\n')}\n`
            : 'browser: selected=false; checks were not run.\n')
    })

    it.each(browserDependencies.flatMap((id) => ['failure', 'cancelled', 'skipped', 'pending', ''].map((result) => [id, result])))(
        'rejects %s with result %s for selected and no-op workflows',
        (id, result) => {
            for (const selected of ['true', 'false']) {
                const needs = successfulBrowserNeeds(selected)
                needs[id].result = result
                const execution = runBrowserSummary(needs)
                expect(execution.error).toBeUndefined()
                expect(execution.status).toBe(1)
                expect(execution.stdout).toBe('')
                expect(execution.stderr).toContain(id)
            }
        },
    )

    it.each(browserDependencies)('rejects missing dependency %s', (id) => {
        const needs = successfulBrowserNeeds()
        delete needs[id]
        expect(runBrowserSummary(needs).status).toBe(1)
    })

    it.each([undefined, null, [], {}, '', '{broken', '{"changes":42}', 'true'])('rejects malformed input %j', (needs) => {
        expect(runBrowserSummary(needs).status).toBe(1)
    })

    it.each(browserDependencies)('rejects malformed result shapes for %s without exposing payloads', (id) => {
        for (const dependency of [null, 'secret-sentinel', [], {}, { result: true }, { result: ['success'] }, { result: 'secret-sentinel' }]) {
            const execution = runBrowserSummary({ ...successfulBrowserNeeds(), [id]: dependency })
            expect(execution.status).toBe(1)
            expect(execution.stdout).toBe('')
            expect(execution.stderr).not.toContain('secret-sentinel')
        }
    })

    it.each([undefined, null, [], {}, true, 'true', { browser: true }, { browser: 'TRUE' }, { browser: '' }, { browser: 'null' }, { browser: 'secret-sentinel' }])(
        'rejects malformed discovery outputs %j',
        (outputs) => {
            const execution = runBrowserSummary({ ...successfulBrowserNeeds(), changes: { result: 'success', outputs } })
            expect(execution.status).toBe(1)
            expect(execution.stdout).toBe('')
            expect(execution.stderr).not.toContain('secret-sentinel')
        },
    )

    it('rejects unexpected successful dependencies without printing arbitrary keys', () => {
        const execution = runBrowserSummary({ ...successfulBrowserNeeds(), 'secret-sentinel': { result: 'success' } })
        expect(execution.status).toBe(1)
        expect(execution.stdout).toBe('')
        expect(execution.stderr).not.toContain('secret-sentinel')
    })

    it.each(browserWorkers)('propagates rejected %s results into the unchanged final aggregate', (id) => {
        for (const result of ['failure', 'cancelled', 'skipped']) {
            const browser = successfulBrowserNeeds()
            browser[id].result = result
            const browserResult = runBrowserSummary(browser)
            expect(browserResult.status).toBe(1)
            const needs = successfulNeeds()
            needs.browser.result = browserResult.status === 0 ? 'success' : 'failure'
            const validation = runSummary(needs)
            expect(validation.status).toBe(1)
            expect(validation.stdout).toBe('')
            expect(validation.stderr).toContain('browser')
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
