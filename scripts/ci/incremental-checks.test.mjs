import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

import { adaptIncrementalPlan } from './incremental-checks.mjs'
import { compileWorkflow, readWorkflow, runChecks } from './run-local-checks.mjs'
import { consumers } from './select-validation.mjs'

const all = Object.fromEntries(consumers.map(name => [name, true]))
const fullPlan = () => compileWorkflow(readWorkflow(), all, { base: 'a'.repeat(40) })
const labels = plan => plan.jobs.flatMap(job => job.steps.map(step => step.label))
const command = (plan, label) => plan.jobs.flatMap(job => job.steps).find(step => step.label === label)?.command
const job = (plan, id) => plan.jobs.find(item => item.id === id)

function fixture(t, paths = []) {
    const repository = mkdtempSync('/tmp/lef-incremental-')
    t.after(() => rmSync(repository, { recursive: true, force: true }))
    for (const path of paths) {
        mkdirSync(dirname(join(repository, path)), { recursive: true })
        writeFileSync(join(repository, path), '// changed fixture\n')
    }
    return repository
}

function adapt(t, paths, existing = paths) {
    return adaptIncrementalPlan(fullPlan(), { paths, repository: fixture(t, existing) })
}

test('plain documentation, including nested web and tooling documentation, only selects changed Harper checks', t => {
    for (const path of ['README.md', 'apps/web/README.md', 'apps/web/tests/README.md', 'scripts/frontend/README.md', 'packages/api-client/README.md', '.agents/plans/feature/00.md']) {
        const plan = adapt(t, [path])
        assert.deepEqual(labels(plan), ['repository-policy/Lint changed documentation with Harper'], path)
        assert.equal(job(plan, 'backend').service, undefined)
    }
    assert(labels(adapt(t, ['docs/privacy/account-discovery-approvals.md'])).includes('repository-policy/Validate account-discovery approvals'))
    assert.deepEqual(labels(adapt(t, ['src/libs/modules/credits/README.md'])), ['repository-policy/Lint changed documentation with Harper', 'repository-policy/Check module architecture'])
})

test('ordinary backend code only lints that file and runs related Jest tests', async t => {
    const path = 'src/libs/modules/credits/src/application/credits.service.ts'
    const plan = adapt(t, [path])
    assert.deepEqual(labels(plan), ['repository-policy/Check module architecture', 'backend/Lint', 'backend/Test'])
    assert.equal(command(plan, 'backend/Lint'), `corepack pnpm exec eslint -- '${path}'`)
    assert.equal(command(plan, 'backend/Test'), `corepack pnpm exec jest --runInBand --findRelatedTests --passWithNoTests '${path}'`)
    assert.deepEqual(plan.backendRelatedPaths, [path])
    assert.equal(plan.backendFullTests, false)
    assert.equal(job(plan, 'backend').service, undefined)
    const calls = []
    await runChecks(plan, { execute: step => calls.push(step), log: () => {} })
    assert.equal(calls.length, 3)
    assert(!calls.some(step => step.command.includes('docker')))
})

test('ordinary web components and untested assets use Vitest related and never run builds or browsers', t => {
    for (const path of ['apps/web/src/features/team/TeamPage.tsx', 'apps/web/src/styles/new-logo.svg']) {
        const plan = adapt(t, [path])
        assert.deepEqual(labels(plan), path.endsWith('.tsx') ? ['web/Audit premium UI contracts', 'web/Lint web application', 'web/Test web application'] : ['web/Test web application'])
        assert(command(plan, 'web/Test web application').includes(`vitest related '${path.slice(9)}' --run --maxWorkers=2 --passWithNoTests`))
        assert(!plan.jobs.some(item => item.id.startsWith('browser') && item.selected))
    }
})

test('shared source dependencies feed both import graphs and source API schemas select contract drift', t => {
    const path = 'src/libs/common/src/header-policy.ts'
    const plan = adapt(t, [path])
    assert(command(plan, 'backend/Test').includes(`'${path}'`))
    assert(command(plan, 'web/Test web application').includes(`'../../${path}'`))
    assert(!command(plan, 'web/Lint web application'))
    assert(labels(adapt(t, ['src/libs/modules/identity/src/api/http/member.dto.ts'])).includes('contract/Check browser API contract drift'))
    assert(!labels(adapt(t, ['src/libs/modules/identity/src/api/http/member.dto.spec.ts'])).includes('contract/Check browser API contract drift'))
})

test('deleted application sources run the remaining tests of their affected target with a visible reason', t => {
    const paths = ['src/libs/modules/credits/src/application/old-helper.ts', 'apps/web/src/features/team/OldPanel.tsx']
    const plan = adapt(t, paths, [])
    assert.deepEqual(labels(plan), ['repository-policy/Check module architecture', 'backend/Test', 'web/Audit premium UI contracts', 'web/Test web application'])
    assert.equal(command(plan, 'backend/Test'), 'corepack pnpm exec jest --runInBand')
    assert.match(command(plan, 'web/Test web application'), /test:ci --maxWorkers=2$/)
    assert.equal(plan.backendFullTests, true)
    assert.deepEqual(plan.backendRelatedPaths, [])
    assert.equal(plan.reasons.filter(reason => reason.includes('deleted source files')).length, 2)
})

test('CI and documentation tooling select their explicit tooling checks without application suites', async t => {
    const paths = ['scripts/ci/local-validation.mjs', 'docker/ci-local/Dockerfile', '.github/workflows/validate.yml']
    const plan = adapt(t, paths)
    assert.deepEqual(labels(plan), [
        'repository-policy/Test validation selection and workflow', 'repository-policy/Check validation fixtures',
        'repository-policy/Test local validation and Git hooks', 'backend/Lint',
    ])
    const calls = []
    await runChecks(plan, { execute: step => calls.push(step), log: () => {} })
    assert(!calls.some(step => step.command.startsWith('docker')))
    assert.deepEqual(labels(adapt(t, ['scripts/docs/harper-lint.mjs'])), ['repository-policy/Test documentation linter', 'backend/Lint'])
})

test('known tooling groups include plans, privacy, architecture, OpenAPI, Vagrant and direct Node tests', t => {
    assert(labels(adapt(t, ['scripts/plans/execplan.ts'])).includes('repository-policy/Test validation selection and workflow'))
    assert(labels(adapt(t, ['scripts/privacy/account-discovery-approvals.ts'])).includes('repository-policy/Validate account-discovery approvals'))
    assert(labels(adapt(t, ['scripts/architecture/check-module-architecture.ts'])).includes('repository-policy/Check module architecture'))
    assert(labels(adapt(t, ['scripts/openapi/contracts.mjs'])).includes('contract/Test browser API contract tooling'))
    assert.deepEqual(labels(adapt(t, ['deploy/proxy-fleet/vagrant/Vagrantfile'])), ['backend/Test Vagrant provider configuration'])
    for (const path of ['scripts/testing/web-live.test.mjs', 'scripts/bruno/run-collection.test.mjs', 'docker/smtp-dev/proxy.test.mjs']) {
        const plan = adapt(t, [path])
        assert.equal(command(plan, 'backend/Test'), `node --test '${path}'`)
        assert(!plan.jobs.some(item => item.id.startsWith('browser') && item.selected))
    }
})

test('shared lint and test configuration broadens only its own validation target', t => {
    assert.deepEqual(labels(adapt(t, ['eslint.config.mjs'])), ['backend/Lint'])
    assert.deepEqual(labels(adapt(t, ['apps/web/eslint.config.mjs'])), ['web/Lint web application'])
    const jest = adapt(t, ['jest.config.ts'])
    assert.deepEqual(labels(jest), ['backend/Lint', 'backend/Test'])
    assert.equal(jest.backendFullTests, true)
    assert.equal(command(jest, 'backend/Test'), 'corepack pnpm exec jest --runInBand')
    const vitest = adapt(t, ['apps/web/vitest.config.ts'])
    assert.deepEqual(labels(vitest), ['web/Lint web application', 'web/Test web application'])
    assert.match(command(vitest, 'web/Test web application'), /test:ci --maxWorkers=2$/)
    const compilation = adapt(t, ['nest-cli.json'])
    assert.deepEqual(labels(compilation), ['backend/Type check', 'backend/Test', 'backend/Build application'])
    assert(compilation.reasons.some(reason => reason.includes('compilation configuration')))
})

test('shared dependency changes keep the full workflow and dictionary changes still lint all documentation', t => {
    const plan = adapt(t, ['pnpm-lock.yaml'])
    assert.equal(labels(plan).length, labels(fullPlan()).length)
    assert.equal(plan.backendFullTests, true)
    assert(job(plan, 'backend').service)
    assert(plan.reasons.some(reason => reason.includes('shared workspace dependencies')))
    const dictionary = adapt(t, ['.harper-dictionary.txt', 'package.json'])
    assert.equal(command(dictionary, 'repository-policy/Lint changed documentation with Harper'), 'corepack pnpm docs:lint')
})

test('direct browser specs preserve the matching config and run exact regex-escaped file filters', t => {
    const plan = adapt(t, ['apps/web/tests/e2e/team-ui.spec.ts'])
    const browser = job(plan, 'browser-ui')
    assert.deepEqual(browser.steps.map(step => step.label), [
        'browser-ui/Install Chromium', 'browser-ui/Build web application for browser suites',
        'browser-ui/Test web browser workflows (changed specifications)',
    ])
    assert.equal(browser.steps.at(-1).command, "corepack pnpm --filter @tuposoft/lead-email-finder-web exec playwright test --config 'playwright.config.ts' 'tests/e2e/team-ui\\.spec\\.ts$'")
    assert(!job(plan, 'browser-live').selected)
    assert(job(plan, 'browser-artifacts').selected)
    assert(!command(plan, 'web/Test web application'))
    const invitation = adapt(t, ['apps/web/tests/e2e/invitations-ui.spec.ts'])
    assert(job(invitation, 'browser-ui').steps.at(-1).command.includes("--config 'playwright.invitation.config.ts'"))
})

test('live browser and Bruno changes retain their setup and cleanup without unrelated test sequences', t => {
    const browser = adapt(t, ['apps/web/tests/e2e/single-verification.spec.ts'])
    const live = job(browser, 'browser-live')
    assert(live.steps.some(step => step.label.includes('Attach disposable SMTP')))
    assert.equal(live.cleanup.length, 2)
    assert(live.steps.at(-1).command.includes("'playwright.verification.config.ts'"))
    assert(!live.steps.some(step => step.command.includes('bruno:')))
    const bruno = adapt(t, ['bruno/proxy-registry/01-list.yml'])
    assert.equal(job(bruno, 'browser-live').steps.filter(step => step.command.includes('bruno:')).length, 1)
    assert(command(bruno, 'browser-live/Test proxy registry HTTP contracts with Bruno'))
    assert(!job(bruno, 'browser-ui').selected)
    assert.equal(job(bruno, 'browser-live').cleanup.length, 2)
    assert.equal(command(bruno, 'backend/Test'), "node --test 'scripts/bruno/proxy-registry-runner.test.mjs'")
})

test('shared CSS and module README changes retain their filesystem-based contract consumers', t => {
    for (const path of ['apps/web/src/styles/tokens.css', 'apps/web/src/styles/global.css', 'apps/web/src/components/SiteHeader.module.css']) {
        const plan = adapt(t, [path])
        assert.deepEqual(labels(plan), ['web/Lint design contract', 'web/Audit premium UI contracts', 'web/Test web application'])
        assert(!plan.jobs.some(item => item.id.startsWith('browser') && item.selected))
    }
    const moduleReadme = adapt(t, ['src/libs/modules/identity/README.md'])
    assert(labels(moduleReadme).includes('repository-policy/Check module architecture'))
    assert(moduleReadme.reasons.some(reason => reason.includes('module-dependency contract')))
    const bruno = adapt(t, ['bruno/platform-credits/01-adjust.yml'])
    assert(command(bruno, 'backend/Test').includes("'scripts/bruno/platform-credits-runner.spec.ts'"))
    assert.deepEqual(bruno.backendRelatedPaths, ['scripts/bruno/platform-credits-runner.spec.ts'])
})

test('known positive fixture specs without dedicated workflow steps still run their real Playwright config', t => {
    for (const [name, config] of [['billing', 'billing'], ['privileged-login-fixtures', 'privileged']]) {
        const plan = adapt(t, [`apps/web/tests/e2e/${name}.spec.ts`])
        assert(job(plan, 'browser-live').steps.at(-1).command.includes(`--config 'playwright.${config}.config.ts'`))
    }
})

test('gateway tooling retains its required web image and omits stack cleanup and unrelated browser steps', t => {
    const plan = adapt(t, ['scripts/frontend/gateway.test.mjs'])
    assert.deepEqual(job(plan, 'browser-live').steps.map(step => step.label), [
        'browser-live/Build independent static web image', 'browser-live/Test Vite and Nginx route ownership and privacy',
    ])
    assert.deepEqual(job(plan, 'browser-live').cleanup, [])
    assert(!job(plan, 'browser-ui').selected)
    assert(!job(plan, 'browser-artifacts').selected)
})

test('an empty diff leaves no executable check or resource lifecycle and never mutates the compiled plan', t => {
    const original = fullPlan()
    const before = structuredClone(original)
    const plan = adaptIncrementalPlan(original, { paths: [], repository: fixture(t) })
    assert.deepEqual(original, before)
    assert.deepEqual(labels(plan), [])
    assert(plan.jobs.every(item => !item.selected && item.cleanup.length === 0 && !item.service))
})

test('unmapped ordinary paths, new workflow checks, changed rewrite commands and malformed paths fail explicitly', t => {
    for (const path of ['new-area/component.ts', 'apps/web/tests/e2e/new-workflow.spec.ts', 'bruno/unmapped/01.yml']) assert.throws(() => adapt(t, [path]), /explicit local scope rule.*--all/)
    const plan = fullPlan()
    job(plan, 'web').steps.push({ label: 'web/A new mandatory check', command: 'corepack pnpm new-check', env: {} })
    assert.throws(() => adaptIncrementalPlan(plan, { paths: [] }), /unmapped workflow check/)
    const drift = fullPlan()
    job(drift, 'backend').steps.find(step => step.label === 'backend/Lint').command = 'corepack pnpm lint && corepack pnpm new-check'
    const path = 'src/example.ts'
    assert.throws(() => adaptIncrementalPlan(drift, { paths: [path], repository: fixture(t, [path]) }), /incremental adapter needs review/)
    const browserDrift = fullPlan()
    job(browserDrift, 'browser-ui').steps.find(step => step.label === 'browser-ui/Test web browser workflows').command += ' && corepack pnpm new-check'
    const spec = 'apps/web/tests/e2e/team-ui.spec.ts'
    assert.throws(() => adaptIncrementalPlan(browserDrift, { paths: [spec], repository: fixture(t, [spec]) }), /incremental adapter needs review/)
    for (const path of ['/absolute.ts', '../outside.ts', 'src/../outside.ts', 'src/bad\nname.ts', 'src\\file.ts']) {
        assert.throws(() => adaptIncrementalPlan(fullPlan(), { paths: [path] }), /invalid repository path/)
    }
})

test('changed filenames remain literal shell arguments, including quotes and command substitutions', t => {
    const path = "src/helpers/quoted'$(touch INCREMENTAL_INJECTION).ts"
    const repository = fixture(t, [path])
    const plan = adaptIncrementalPlan(fullPlan(), { paths: [path], repository })
    const executable = join(repository, 'corepack')
    writeFileSync(executable, '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)))\n', { mode: 0o755 })
    const outcome = spawnSync('bash', ['-c', command(plan, 'backend/Lint')], { cwd: repository, env: { ...process.env, PATH: `${repository}:${process.env.PATH}` }, encoding: 'utf8' })
    assert.equal(outcome.status, 0, outcome.stderr)
    assert.deepEqual(JSON.parse(outcome.stdout), ['pnpm', 'exec', 'eslint', '--', path])
    assert(!existsSync(join(repository, 'INCREMENTAL_INJECTION')))
})
