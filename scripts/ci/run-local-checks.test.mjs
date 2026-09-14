import assert from 'node:assert/strict'
import { test } from 'node:test'

import { consumers } from './select-validation.mjs'
import { compileLocalWorkflow, compileWorkflow, executeShell, main, readWorkflow, runChecks } from './run-local-checks.mjs'

const workflow = readWorkflow()
const allSelected = Object.fromEntries(consumers.map(name => [name, true]))
const selection = (...names) => Object.fromEntries(consumers.map(name => [name, names.includes(name)]))
const compile = (selected = allSelected, source = workflow) => compileWorkflow(source, selected, { base: 'a'.repeat(40) })
const record = (failure = () => false) => {
    const calls = []
    return {
        calls,
        execute: step => {
            calls.push(step)
            if (failure(step)) throw new Error(`Deliberate failure: ${step.label}`)
        },
        log: () => {},
    }
}

test('accounts for every workflow step and preserves executable checks in workflow order', () => {
    const plan = compile()
    assert.equal(plan.accounted.length, Object.values(workflow.jobs).reduce((sum, job) => sum + job.steps.length, 0))
    assert.deepEqual(plan.jobs.map(job => job.id), ['repository-policy', 'backend', 'web', 'contract', 'images', 'browser-artifacts', 'browser-ui', 'browser-live'])
    const namedChecks = [
        ['repository-policy', 'Check module architecture'], ['backend', 'Test'],
        ['backend', 'Test organization directory PostgreSQL page boundaries'], ['web', 'Test web application'],
        ['contract', 'Check browser API contract drift'], ['images', 'Test packaged account-discovery manifest'],
        ['browser-artifacts', 'Verify privileged authentication artifact suppression'],
        ['browser-ui', 'Test web visual baselines'], ['browser-live', 'Test batch verification HTTP contracts with Bruno'],
        ['browser-live', 'Test live batch upload, route recovery, and result download'],
    ]
    for (const [id, name] of namedChecks) {
        const step = workflow.jobs[id].steps.find(item => item.name === name)
        assert.equal(plan.jobs.find(job => job.id === id).steps.find(item => item.label === `${id}/${name}`).command, step.run)
    }
    for (const job of plan.jobs) {
        const indices = job.steps.map(step => workflow.jobs[job.id].steps.findIndex(original => `${job.id}/${original.name}` === step.label))
        assert.deepEqual(indices, [...indices].sort((a, b) => a - b))
    }
    assert.equal(plan.accounted.filter(step => step.command?.includes('playwright install --with-deps chromium')).length, 3)
    assert.equal(plan.accounted.filter(step => step.command?.startsWith('docker build --file')).length, 4)
    const live = plan.jobs.find(job => job.id === 'browser-live')
    assert.equal(live.cleanup.length, 2)
    assert.match(live.cleanup.at(-1).command, /down --volumes --remove-orphans$/)
})

test('new ordinary run checks are automatically included rather than silently omitted', async () => {
    const modified = structuredClone(workflow)
    modified.jobs.contract.steps.push({ name: 'New contract check', run: 'node scripts/check-new-contract.mjs' })
    const fake = record()
    await runChecks(compile(selection('contract'), modified), fake)
    assert.equal(fake.calls.at(-1).command, 'node scripts/check-new-contract.mjs')
})

test('rejects unsupported workflow changes before executing even an unselected job', () => {
    const mutations = [
        source => { source.jobs.backend.strategy = { matrix: { node: [24] } } },
        source => { source.defaults = { run: { shell: 'sh' } } },
        source => { source.jobs.additional = { steps: [{ run: 'true' }] } },
        source => { delete source.jobs.contract },
        source => { delete source.jobs.backend.services },
        source => { source.jobs.backend.services.redis = { image: 'redis' } },
        source => { source.jobs.backend.services.postgres.image = 'postgres:20' },
        source => { source.jobs.web.steps.push({ uses: 'unknown/check@v1' }) },
        source => { source.jobs.web.steps.push({ run: 'true', 'working-directory': 'apps/web' }) },
        source => { source.jobs.web.steps.push({ run: 'true', env: { SECRET: '${{ secrets.UNKNOWN }}' } }) },
        source => { source.jobs.web.steps.push({ run: 'echo ${{ github.sha }}' }) },
        source => { source.jobs.web.steps.push({ run: 'true', if: 'failure()' }) },
        source => { source.jobs.web.steps.push({ run: 'true', if: "needs.changes.outputs.web == 'false'" }) },
        source => { source.jobs.web.steps.push({ run: 'true', 'continue-on-error': '${{ true }}' }) },
        source => { source.jobs.web.steps.push({ run: 'true', shell: 'pwsh' }) },
        source => { source.jobs.changes.steps.push({ run: 'node some-additional-check.mjs' }) },
        source => { source.jobs.web.steps.find(step => step.name === 'Enable Corepack').run = 'corepack enable\nnode some-check.mjs' },
        source => { source.jobs.web.steps.find(step => step.name === 'Install dependencies').run += '\nnode some-check.mjs' },
        source => { source.jobs.images.steps.find(step => step.name === 'Build production image').with.platforms = 'linux/arm64' },
        source => { source.jobs.images.steps.find(step => step.name === 'Build production image').with.push = true },
        source => { source.jobs['browser-live'].needs = ['changes'] },
    ]
    for (const mutate of mutations) {
        const source = structuredClone(workflow)
        mutate(source)
        assert.throws(() => compile(selection('repositoryPolicy'), source), /Local validation:/, mutate.toString())
    }
})

test('fails closed for invalid selection outputs', () => {
    assert.throws(() => compileWorkflow(workflow, { ...allSelected, backend: 'true' }), /booleans/)
    assert.throws(() => compileWorkflow(workflow, { backend: true }), /selection keys/)
})

test('local planning uses the exact comparison and scopes nested documentation to Harper', () => {
    const actual = compileLocalWorkflow(workflow, { base: 'a'.repeat(40), commit: 'b'.repeat(40), repository: '/repo', discover: (...args) => {
        assert.deepEqual(args, ['push', { before: 'a'.repeat(40), after: 'b'.repeat(40) }, '/repo'])
        return ['apps/web/README.md']
    } })
    assert.deepEqual(actual.jobs.filter(job => job.selected).flatMap(job => job.steps.map(step => step.command)), ['corepack pnpm docs:lint:changed'])
})

test('uncertain local comparisons fail instead of silently validating the entire repository', () => {
    assert.throws(() => compileLocalWorkflow(workflow), /comparison base is required/)
    assert.throws(() => compileLocalWorkflow(workflow, { base: 'a'.repeat(40), discover: () => { throw new Error('Missing history') } }), /Missing history/)
    assert.throws(() => compileLocalWorkflow(workflow, { base: 'a'.repeat(40), discover: () => ['../untrusted'] }), /path/i)
    assert.throws(() => compileLocalWorkflow(workflow, { base: 'a'.repeat(40), all: true }), /not both/)
})

test('an explicit full local run retains every check without discovering a comparison', () => {
    const plan = compileLocalWorkflow(workflow, { all: true, discover: () => { throw new Error('Must not discover') } })
    assert(plan.jobs.every(job => job.selected))
    assert.deepEqual(plan.accounted, compileWorkflow(workflow, allSelected).accounted)
    assert.equal(plan.jobs[0].steps.find(step => step.advisory).command, 'corepack pnpm docs:lint')
})

test('an empty local comparison executes no checks, database services, or cleanup commands', async () => {
    const fake = record()
    const plan = compileLocalWorkflow(workflow, { base: 'a'.repeat(40), commit: 'b'.repeat(40), discover: () => [] })
    await runChecks(plan, fake)
    assert.deepEqual(fake.calls, [])
})

test('incremental tooling validation continues after Harper and stops at its first required failure', async () => {
    const plan = compileLocalWorkflow(workflow, {
        base: 'a'.repeat(40), commit: 'b'.repeat(40),
        discover: () => ['README.md', 'scripts/ci/run-local-checks.mjs'],
    })
    const harper = 'repository-policy/Lint changed documentation with Harper'
    const required = 'repository-policy/Test local validation and Git hooks'
    const messages = []
    const fake = record(step => [harper, required].includes(step.label))
    await assert.rejects(runChecks(plan, { ...fake, log: message => messages.push(message) }), /Test local validation and Git hooks/)
    assert(messages.some(message => message.startsWith(`Advisory check failed: ${harper}:`)))
    assert.equal(fake.calls.at(-1).label, required)
    assert(!fake.calls.some(step => /docker|playwright|pnpm build/.test(step.command)))
})

test('an application dependency selects only its related database suite with the dedicated environment', async () => {
    const path = 'src/libs/modules/credits/src/application/credits.service.ts'
    const plan = compileLocalWorkflow(workflow, {
        base: 'a'.repeat(40), commit: 'b'.repeat(40), discover: () => [path],
        relatedJestTests: paths => {
            assert.deepEqual(paths, [path])
            return ['/repo/src/credits.service.integration.spec.ts', '/repo/src/credits.service.spec.ts']
        },
    })
    const fake = record()
    await runChecks(plan, fake)
    assert(fake.calls.some(step => step.label === 'backend/Start PostgreSQL'))
    const database = fake.calls.filter(step => Object.keys(step.env).some(key => key.startsWith('TEST_')))
    assert.deepEqual(database.map(step => step.label), ['backend/Test credit account debits against a real database'])
    assert.equal(database[0].env.TEST_CREDITS_POSTGRES_URL, 'postgresql://postgres:postgres@localhost:5432/lef_identity_test')
    assert.match(fake.calls.find(step => step.label === 'backend/Test').command, /--findRelatedTests/)
    assert.equal(fake.calls.at(-1).label, 'backend/Stop PostgreSQL')
})

test('ordinary source with no related integration tests starts no database or unrelated checks', async () => {
    const plan = compileLocalWorkflow(workflow, {
        base: 'a'.repeat(40), commit: 'b'.repeat(40),
        discover: () => ['src/libs/modules/email-verification/src/application/finding/normalize-finding-input.ts'],
        relatedJestTests: () => ['/repo/src/normalize-finding-input.spec.ts'],
    })
    const fake = record()
    await runChecks(plan, fake)
    assert.deepEqual(fake.calls.map(step => step.label), ['repository-policy/Check module architecture', 'backend/Lint', 'backend/Test'])
})

test('deleted backend dependencies retain all database coverage without trusting an incomplete graph', () => {
    const plan = compileLocalWorkflow(workflow, {
        base: 'a'.repeat(40), commit: 'b'.repeat(40), discover: () => ['src/deleted-incremental-fixture.ts'],
        relatedJestTests: () => assert.fail('Deleted source requires a full target test run'),
    })
    const backend = plan.jobs.find(job => job.id === 'backend')
    assert(backend.service)
    assert.equal(backend.steps.filter(step => Object.keys(step.env).some(key => key.startsWith('TEST_'))).length, 5)
    assert(!plan.jobs.filter(job => job.id !== 'backend').some(job => job.selected))
})

test('related-test discovery failure stops local planning rather than silently skipping integration coverage', () => {
    assert.throws(() => compileLocalWorkflow(workflow, {
        base: 'a'.repeat(40), commit: 'b'.repeat(40), discover: () => ['src/libs/modules/credits/src/application/credits.service.ts'],
        relatedJestTests: () => { throw new Error('Dependency graph is unavailable') },
    }), /Dependency graph is unavailable/)
})

test('runs only selected consumers and forwards base revisions to their checks', async () => {
    const fake = record()
    await runChecks(compile(selection('repositoryPolicy')), fake)
    assert(fake.calls.every(step => step.label.startsWith('repository-policy/')))
    assert(fake.calls.some(step => step.env.HARPER_BASE_SHA === 'a'.repeat(40)))
    assert(fake.calls.some(step => step.env.ACCOUNT_DISCOVERY_APPROVALS_BASE_SHA === 'a'.repeat(40)))
})

test('an explicit full run lints all tracked documentation', async () => {
    const fake = record()
    const plan = compileLocalWorkflow(workflow, { all: true })
    plan.jobs = plan.jobs.filter(job => job.id === 'repository-policy')
    await runChecks(plan, fake)
    const harper = fake.calls.find(step => step.label.endsWith('/Lint changed documentation with Harper'))
    assert.equal(harper.command, 'corepack pnpm docs:lint')
    assert.equal(harper.env.HARPER_BASE_SHA, '')
})

test('backend starts a real service before tests and passes each database URL only to its targeted test', async () => {
    const fake = record()
    await runChecks(compile(selection('backend')), {
        ...fake,
        env: { CI: 'false', HUSKY: '1', TEST_POSTGRES_URL: 'do-not-inherit', TEST_CREDITS_POSTGRES_URL: 'do-not-inherit' },
    })
    assert.match(fake.calls[0].command, /docker run --detach .*--publish 127\.0\.0\.1:5432:5432 .* postgres:18-alpine$/)
    assert.match(fake.calls[1].command, /docker inspect --format '{{\.State\.Health\.Status}}'/)
    assert.equal(fake.calls.at(-1).command, 'docker rm --force --volumes lef-local-postgres')
    const databaseCalls = fake.calls.filter(step => Object.keys(step.env).some(key => key.startsWith('TEST_')))
    assert.equal(databaseCalls.length, 5)
    for (const call of fake.calls) {
        assert.equal(call.env.CI, 'true')
        assert.equal(call.env.HUSKY, '0')
        assert.equal(call.env.API_START_COMMAND, 'pnpm exec nest start')
        for (const [key, value] of Object.entries(call.env)) {
            if (key.startsWith('TEST_')) assert.equal(value, 'postgresql://postgres:postgres@localhost:5432/lef_identity_test')
        }
    }
    assert(!Object.keys(fake.calls.find(step => step.label === 'backend/Test').env).some(key => key.startsWith('TEST_')))
})

test('PostgreSQL readiness failure blocks tests and still removes the owned service', async () => {
    const fake = record(step => step.label === 'backend/Wait for PostgreSQL')
    await assert.rejects(runChecks(compile(selection('backend')), fake), /Wait for PostgreSQL/)
    assert.deepEqual(fake.calls.map(step => step.label), ['backend/Start PostgreSQL', 'backend/Wait for PostgreSQL', 'backend/Stop PostgreSQL'])
})

test('Harper failure is reported and later checks continue with or without a comparison base', async () => {
    for (const base of ['a'.repeat(40), undefined]) {
        const label = 'repository-policy/Lint changed documentation with Harper'
        const fake = record(step => step.label === label)
        const messages = []
        await runChecks(compileWorkflow(workflow, allSelected, { base }), { ...fake, log: message => messages.push(message) })
        assert(fake.calls.some(step => step.label === 'repository-policy/Check module architecture'))
        assert(fake.calls.some(step => step.label.startsWith('backend/')))
        assert(messages.some(message => message.startsWith(`Advisory check failed: ${label}:`)))
    }
})

test('a required failure after advisory Harper still stops subsequent checks', async () => {
    const fake = record(step => step.label === 'repository-policy/Lint changed documentation with Harper'
        || step.label === 'repository-policy/Check module architecture')
    await assert.rejects(runChecks(compile(), fake), /Check module architecture/)
    assert.equal(fake.calls.at(-1).label, 'repository-policy/Check module architecture')
    assert(!fake.calls.some(step => step.label.startsWith('backend/')))
})

test('workflow continue-on-error cannot bypass local failure or prevent cleanup', async () => {
    const modified = structuredClone(workflow)
    const failedStep = modified.jobs.backend.steps.find(step => step.name === 'Type check')
    failedStep['continue-on-error'] = true
    const fake = record(step => step.label === 'backend/Type check' || step.label === 'backend/Stop PostgreSQL')
    await assert.rejects(runChecks(compile(selection('backend', 'web'), modified), fake), /backend\/Type check/)
    assert.deepEqual(fake.calls.slice(-2).map(step => step.label), ['backend/Type check', 'backend/Stop PostgreSQL'])
    assert(!fake.calls.some(step => step.label === 'backend/Test' || step.label.startsWith('web/')))
})

test('required failures stop subsequent checks and still remove the owned service', async () => {
    const failing = record(step => step.label === 'backend/Type check')
    await assert.rejects(runChecks(compile(selection('backend', 'web')), failing), /Type check/)
    assert(!failing.calls.some(step => step.label === 'backend/Test' || step.label.startsWith('web/')))
    assert.equal(failing.calls.at(-1).label, 'backend/Stop PostgreSQL')
})

test('browser artifact failure prevents UI and live suites', async () => {
    const fake = record(step => step.label.includes('Verify privileged authentication artifact suppression'))
    await assert.rejects(runChecks(compile(selection('browser')), fake), /privileged authentication/)
    assert(!fake.calls.some(step => step.label.startsWith('browser-ui/') || step.label.startsWith('browser-live/')))
})

test('live browser failure always reports health and tears down even when health reporting also fails', async () => {
    const fake = record(step => step.label.includes('Test genuine same-origin') || step.label.endsWith('/Report service health'))
    await assert.rejects(runChecks(compile(selection('browser')), fake), /Test genuine same-origin/)
    assert.deepEqual(fake.calls.slice(-2).map(step => step.label), ['browser-live/Report service health', "browser-live/Stop this runner's disposable stack"])
    assert(!fake.calls.some(step => step.label.includes('Test BFF and gateway HTTP contracts')))
})

test('cleanup failure is a failed validation and job timeouts still allow cleanup', async () => {
    const failingCleanup = record(step => step.label === 'backend/Stop PostgreSQL')
    await assert.rejects(runChecks(compile(selection('backend')), failingCleanup), /Stop PostgreSQL/)
    const plan = compile(selection('backend'))
    plan.jobs.find(job => job.id === 'backend').timeoutMs = 1
    let tick = 0
    const fake = record()
    await assert.rejects(runChecks(plan, { ...fake, now: () => tick++ }), /exceeded its workflow timeout/)
    assert.equal(fake.calls.at(-1).label, 'backend/Stop PostgreSQL')
})

test('shell execution propagates a failing pipeline and the entrypoint rejects host execution', async () => {
    assert.throws(() => executeShell({ label: 'pipeline', command: 'false | true', env: process.env }), /exit 1/)
    await assert.rejects(main({}), /must run inside the isolated local CI container/)
})
