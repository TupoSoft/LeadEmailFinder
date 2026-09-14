import { lstatSync } from 'node:fs'
import { resolve } from 'node:path'

const web = 'corepack pnpm --filter @tuposoft/lead-email-finder-web'
const names = {
    'repository-policy': [
        'Test documentation linter', 'Validate account-discovery approvals', 'Lint changed documentation with Harper',
        'Check module architecture', 'Test validation selection and workflow', 'Check validation fixtures',
        'Test local validation and Git hooks',
    ],
    backend: [
        'Test Vagrant provider configuration', 'Lint', 'Type check', 'Test', 'Test empty-database synchronization',
        'Test credit account debits against a real database', 'Test payment adjustments against a real database',
        'Test email-verification persistence stores against a real database',
        'Test organization directory PostgreSQL page boundaries', 'Build application',
    ],
    web: [
        'Test premium UI audit', 'Lint design contract', 'Audit premium UI contracts', 'Lint web application',
        'Type check web application', 'Build generated API client', 'Test web application', 'Build web application',
    ],
    contract: ['Check browser API contract drift', 'Test browser API contract tooling', 'Build generated API client'],
    images: [
        'Build production image', 'Test packaged account-discovery manifest', 'Build independent development API image',
        'Build independent static web image', 'Validate Compose topology',
    ],
    'browser-artifacts': [
        'Install Chromium', 'Verify privileged authentication artifact suppression', 'Verify invitation browser artifact suppression',
        'Verify verification browser artifact suppression', 'Verify service-client browser artifact suppression',
        'Verify proxy browser artifact suppression',
    ],
    'browser-ui': [
        'Install Chromium', 'Build web application for browser suites', 'Test web browser workflows',
        'Test service-client secret handling and recovery', 'Test invitation browser behavior and recovery',
        'Test platform organization directory and invitation recovery', 'Test platform credit adjustment and recovery',
        'Test proxy fleet management and credential recovery', 'Test web accessibility', 'Test web visual baselines',
    ],
    'browser-live': [
        'Install Chromium', 'Build independent static web image', 'Test Vite and Nginx route ownership and privacy',
        'Reset, provision, and check disposable development stack', 'Test genuine same-origin browser session and log privacy',
        'Test BFF and gateway HTTP contracts with Bruno', 'Bootstrap MFA-aware browser identities',
        'Test organization onboarding HTTP contracts with Bruno', 'Test live platform organization bootstrap',
        'Test platform credit HTTP contracts with Bruno', 'Test live platform credit adjustment and recovery',
        'Test proxy registry HTTP contracts with Bruno', 'Test live proxy fleet lifecycle',
        'Test live team management and invitation acceptance', 'Test service-client rejection contracts with Bruno',
        'Test live service-client lifecycle', 'Attach disposable SMTP and DNS verification fixtures',
        'Test async verification HTTP contracts with Bruno', 'Test live single-email verification and route recovery',
        'Test batch verification HTTP contracts with Bruno', 'Test live batch upload, route recovery, and result download',
        'Report service health', "Stop this runner's disposable stack",
    ],
}

const policy = name => `repository-policy/${name}`
const live = name => `browser-live/${name}`
const ui = name => `browser-ui/${name}`
const backendTest = 'backend/Test'
const webTest = 'web/Test web application'
const nodeRunnerCommand = 'corepack pnpm test:oidc-runners'
const chromium = 'Install Chromium'
const uiBuild = 'Build web application for browser suites'
const liveBuild = 'Build independent static web image'
const reset = 'Reset, provision, and check disposable development stack'
const bootstrap = 'Bootstrap MFA-aware browser identities'
const smtp = 'Attach disposable SMTP and DNS verification fixtures'

// A spec's own Playwright configuration is retained even when only that file runs.
const browserSpecs = {
    'public-entry.spec.ts': ['ui', 'Test web browser workflows'],
    'not-found.spec.ts': ['ui', 'Test web browser workflows'],
    'auth-shell.spec.ts': ['ui', 'Test web browser workflows'],
    'billing-ui.spec.ts': ['ui', 'Test web browser workflows'],
    'team-ui.spec.ts': ['ui', 'Test web browser workflows'],
    'verification-ui.spec.ts': ['ui', 'Test web browser workflows'],
    'batch-verification-ui.spec.ts': ['ui', 'Test web browser workflows'],
    'accessibility.spec.ts': ['ui', 'Test web accessibility'],
    'visual.spec.ts': ['ui', 'Test web visual baselines'],
    'service-clients-ui.spec.ts': ['ui', 'Test service-client secret handling and recovery', 'service-clients'],
    'invitations-ui.spec.ts': ['ui', 'Test invitation browser behavior and recovery', 'invitation'],
    'platform-organizations-ui.spec.ts': ['ui', 'Test platform organization directory and invitation recovery', 'platform-organizations'],
    'platform-credits-ui.spec.ts': ['ui', 'Test platform credit adjustment and recovery', 'platform-credits'],
    'platform-proxies-ui.spec.ts': ['ui', 'Test proxy fleet management and credential recovery', 'platform-proxies'],
    'platform-organizations.spec.ts': ['live', 'Test live platform organization bootstrap', 'platform-organizations-live'],
    'platform-credits.spec.ts': ['live', 'Test live platform credit adjustment and recovery', 'platform-credits-live'],
    'platform-proxies.spec.ts': ['live', 'Test live proxy fleet lifecycle', 'platform-proxies-live'],
    'team-and-invitations.spec.ts': ['live', 'Test live team management and invitation acceptance', 'team'],
    'service-clients.spec.ts': ['live', 'Test live service-client lifecycle', 'service-clients-live'],
    'single-verification.spec.ts': ['live', 'Test live single-email verification and route recovery', 'verification'],
    'batch-verification.spec.ts': ['live', 'Test live batch upload, route recovery, and result download', 'batch-verification'],
    // These fixture suites have package scripts but no separate positive workflow step.
    'billing.spec.ts': ['live', 'Test live team management and invitation acceptance', 'billing'],
    'privileged-login-fixtures.spec.ts': ['live', 'Test live team management and invitation acceptance', 'privileged'],
}
const browserCommands = {
    [ui('Test web browser workflows')]: 'test:e2e:prebuilt',
    [ui('Test web accessibility')]: 'test:a11y:prebuilt',
    [ui('Test web visual baselines')]: 'test:visual:prebuilt',
    [ui('Test service-client secret handling and recovery')]: 'test:service-clients',
    [ui('Test invitation browser behavior and recovery')]: 'test:invitations',
    [ui('Test platform organization directory and invitation recovery')]: 'test:platform-organizations',
    [ui('Test platform credit adjustment and recovery')]: 'test:platform-credits',
    [ui('Test proxy fleet management and credential recovery')]: 'test:platform-proxies',
    [live('Test live platform organization bootstrap')]: 'test:platform-organizations-live',
    [live('Test live platform credit adjustment and recovery')]: 'test:platform-credits-live',
    [live('Test live proxy fleet lifecycle')]: 'test:platform-proxies-live',
    [live('Test live team management and invitation acceptance')]: 'test:team-live',
    [live('Test live service-client lifecycle')]: 'test:service-clients-live',
    [live('Test live single-email verification and route recovery')]: 'test:verification-live',
    [live('Test live batch upload, route recovery, and result download')]: 'test:batch-verification-live',
}
const brunoCollections = {
    'bff-sessions': 'Test BFF and gateway HTTP contracts with Bruno',
    'organization-onboarding': 'Test organization onboarding HTTP contracts with Bruno',
    'platform-credits': 'Test platform credit HTTP contracts with Bruno',
    'proxy-registry': 'Test proxy registry HTTP contracts with Bruno',
    'service-client-management': 'Test service-client rejection contracts with Bruno',
    'async-verification': 'Test async verification HTTP contracts with Bruno',
    'batch-verification': 'Test batch verification HTTP contracts with Bruno',
}
const brunoStructuralTests = {
    'bff-sessions': 'run-collection.test.mjs',
    'organization-onboarding': 'organization-onboarding-runner.test.mjs',
    'platform-credits': 'platform-credits-runner.spec.ts',
    'proxy-registry': 'proxy-registry-runner.test.mjs',
    'service-client-management': 'service-client-management-runner.test.mjs',
    'async-verification': 'async-verification-runner.test.mjs',
    'batch-verification': 'batch-verification-runner.test.mjs',
}
const artifactFiles = {
    'browser-fixture-artifacts.spec.mjs': 'Verify privileged authentication artifact suppression',
    'invitation-browser-artifacts.spec.mjs': 'Verify invitation browser artifact suppression',
    'verification-browser-artifacts.spec.mjs': 'Verify verification browser artifact suppression',
    'service-client-browser-artifacts.spec.mjs': 'Verify service-client browser artifact suppression',
    'proxy-browser-artifacts.spec.mjs': 'Verify proxy browser artifact suppression',
}

function quote(value) {
    return `'${value.replaceAll("'", "'\\''")}'`
}

function exactPlaywrightFilter(path) {
    return `${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}

function fail(message) {
    throw new Error(`Incremental validation: ${message}. Add an explicit local scope rule before pushing; ci:local --all runs full validation manually.`)
}

function validatePlan(plan) {
    for (const job of plan.jobs) {
        if (!Object.hasOwn(names, job.id)) fail(`unmapped workflow job ${job.id}`)
        for (const step of [...job.steps, ...job.cleanup]) {
            if (!names[job.id].some(name => step.label === `${job.id}/${name}`)) fail(`unmapped workflow check ${step.label}`)
        }
    }
}

function rewrite(step, expected, command) {
    if (![].concat(expected).includes(step.command.trim())) fail(`command changed for ${step.label}; its incremental adapter needs review`)
    return { ...step, command }
}

/** Select explicit checks from the already validated workflow; never mutate its full-check plan. */
export function adaptIncrementalPlan(plan, { paths, repository = process.cwd() }) {
    validatePlan(plan)
    if (!Array.isArray(paths)) fail('a trustworthy changed-path list is required')
    for (const path of paths) {
        if (typeof path !== 'string' || !path || path.includes('\\') || [...path].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
            || /^[a-z]:/i.test(path) || path.split('/').some(part => ['', '.', '..'].includes(part))) fail('invalid repository path')
    }
    const changes = [...new Set(paths)].sort()
    const result = structuredClone(plan)
    const selected = new Set()
    const fullJobs = new Set()
    const reasons = new Set()
    const lint = { backend: [], web: [] }
    const related = { backend: [], web: [] }
    const fullTests = new Set()
    const fullLint = new Set()
    const exactSpecs = new Map()
    const fullSpecLabels = new Set()
    const nodeTestFiles = []
    let nodeRunners = false
    const add = (...labels) => labels.forEach(label => selected.add(label))
    const broaden = (jobs, reason) => { jobs.forEach(job => fullJobs.add(job)); reasons.add(reason) }
    const ci = () => add(policy('Test validation selection and workflow'), policy('Check validation fixtures'), policy('Test local validation and Git hooks'))
    const audits = () => add('web/Test premium UI audit', 'web/Lint design contract', 'web/Audit premium UI contracts')
    const fileExists = path => {
        try { return lstatSync(resolve(repository, path)).isFile() } catch (error) {
            if (error.code === 'ENOENT') return false
            throw error
        }
    }
    const code = (path, target = 'backend', tests = true) => {
        const existing = fileExists(path)
        const operand = target === 'web' ? path.startsWith('apps/web/') ? path.slice(9) : `../../${path}` : path
        if (existing && /\.[cm]?[jt]sx?$/.test(path) && (target !== 'web' || path.startsWith('apps/web/'))) lint[target].push(operand)
        if (!tests) return
        if (existing) related[target].push(operand)
        else {
            fullTests.add(target)
            reasons.add(`${path} was removed; ${target} tests run for the whole target because dependency graphs omit deleted source files.`)
        }
    }
    const browserSetup = (target, withSmtp = false) => {
        // These guards protect every browser fixture suite, including narrowly selected ones.
        broaden(['browser-artifacts'], 'Selected browser or HTTP fixture checks require the shared artifact guards.')
        if (target === 'ui') add(ui(chromium), ui(uiBuild))
        else {
            add(live(chromium), live(liveBuild), live(reset), live(bootstrap))
            if (withSmtp) add(live(smtp))
        }
    }
    const spec = (path, matchPath = path) => {
        const name = matchPath.slice('apps/web/tests/e2e/'.length)
        const owner = browserSpecs[name]
        if (!owner) fail(`unmapped Playwright specification ${path}`)
        const [target, nameOfCheck, suffix] = owner
        const label = `browser-${target}/${nameOfCheck}`
        browserSetup(target, ['verification', 'batch-verification'].includes(suffix))
        add(label)
        if (!fileExists(matchPath)) {
            fullSpecLabels.add(label)
            exactSpecs.delete(label)
            reasons.add(`${matchPath} was removed; its remaining Playwright suite runs with the existing configuration.`)
            return
        }
        if (fullSpecLabels.has(label)) return
        const config = suffix ? `playwright.${suffix}.config.ts` : 'playwright.config.ts'
        if (!exactSpecs.has(label)) exactSpecs.set(label, new Map())
        const byConfig = exactSpecs.get(label)
        if (!byConfig.has(config)) byConfig.set(config, new Set())
        byConfig.get(config).add(matchPath.slice(9))
    }

    for (const path of changes) {
        if (path.startsWith('src/libs/modules/') && (/\.[cm]?[jt]sx?$/.test(path) || /^src\/libs\/modules\/(?:[^/]+\/)?README\.md$/.test(path))) {
            add(policy('Check module architecture'))
            reasons.add('Changed module source or README declarations require the shared module-dependency contract check.')
        }
        // ui:audit reads these files through sourceRoots, rather than JavaScript imports.
        if (path.startsWith('apps/web/src/') && /\.(?:css|scss|html|js|jsx|ts|tsx)$/.test(path)) {
            add('web/Audit premium UI contracts')
            if (/\.(?:css|scss)$/.test(path)) add('web/Lint design contract')
            reasons.add('Changed web source is an input to the shared UI contract audit.')
        }
        if (['DESIGN.md', 'UX-CONTRACT.md', 'premium-ui.json'].includes(path)) {
            broaden(['web', 'images', 'browser-artifacts', 'browser-ui', 'browser-live'], `${path} changes a shared web contract.`)
            if (/\.md$/i.test(path)) add(policy('Lint changed documentation with Harper'))
        } else if (/\.md$/i.test(path)) {
            add(policy('Lint changed documentation with Harper'))
            if (/account-discovery.*approval|approval.*account-discovery/.test(path)) add(policy('Validate account-discovery approvals'))
        } else if (path === '.harper-dictionary.txt') {
            add(policy('Test documentation linter'), policy('Lint changed documentation with Harper'))
            reasons.add('The shared Harper dictionary changed; linting covers every tracked Markdown file.')
        } else if (['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs'].includes(path)) {
            broaden(Object.keys(names), `${path} changes shared workspace dependencies or scripts.`)
        } else if (/^tsconfig(?:\.[\w-]+)?\.json$/.test(path) || ['nest-cli.json', '.swcrc'].includes(path)) {
            add('backend/Type check', 'backend/Build application'); fullTests.add('backend')
            if (path === 'tsconfig.base.json') {
                add('web/Type check web application', 'web/Build web application', 'contract/Build generated API client')
                fullTests.add('web')
            }
            reasons.add(`${path} changes shared compilation configuration; affected type checks, builds, and tests run.`)
        } else if (path === 'jest.config.ts') {
            fullTests.add('backend'); code(path, 'backend', false)
            reasons.add('Shared Jest configuration changed; the backend test target runs in full.')
        } else if (path === 'eslint.config.mjs') {
            fullLint.add('backend')
            reasons.add('Shared backend ESLint configuration changed; the backend lint target runs in full.')
        } else if (path.startsWith('scripts/ci/') || path.startsWith('.husky/') || path.startsWith('docker/ci-local/') || path === '.github/workflows/validate.yml') {
            ci(); if (/\.[cm]?[jt]sx?$/.test(path)) code(path, 'backend', path.endsWith('.spec.ts'))
        } else if (path.startsWith('scripts/docs/')) {
            add(policy('Test documentation linter')); code(path, 'backend', false)
        } else if (path.startsWith('scripts/plans/')) {
            add(policy('Test validation selection and workflow')); code(path)
        } else if (path.startsWith('scripts/architecture/')) {
            add(policy('Check module architecture')); code(path)
        } else if (path.startsWith('scripts/privacy/') || path.startsWith('config/privacy/')) {
            add(policy('Validate account-discovery approvals')); if (/\.[cm]?[jt]s$/.test(path)) code(path)
        } else if (path.startsWith('scripts/security/')) {
            code(path)
        } else if (path.startsWith('scripts/openapi/')) {
            broaden(['contract'], `${path} changes shared OpenAPI generation tooling.`); code(path, 'backend', false)
        } else if (path.startsWith('packages/api-client/')) {
            broaden(['contract', 'web'], `${path} changes the shared browser API client dependency.`)
        } else if (path.startsWith('scripts/frontend/audit-premium-ui')) {
            audits(); code(path, 'backend', false)
        } else if (['scripts/frontend/gateway.test.mjs', 'scripts/frontend/checkout-config.test.mjs', 'apps/web/gateway-routes.ts'].includes(path)
            || path.startsWith('docker/web/')) {
            add(live(liveBuild), live('Test Vite and Nginx route ownership and privacy'))
            if (/\.[cm]?[jt]s$/.test(path)) code(path, path.startsWith('apps/web/') ? 'web' : 'backend', false)
        } else if (path.startsWith('apps/web/tests/e2e/') && /\.spec\.ts(?:-snapshots\/.*)?$/.test(path)) {
            const matchPath = path.replace(/-snapshots\/.*$/, '')
            spec(path, matchPath); if (path === matchPath) code(path, 'web', false)
        } else if (path.startsWith('apps/web/tests/gateway/') && path.endsWith('.spec.ts')) {
            browserSetup('live'); add(live('Test genuine same-origin browser session and log privacy')); code(path, 'web', false)
        } else if (path.startsWith('apps/web/tests/support/') && path.endsWith('.test.ts')) {
            code(path, 'web')
        } else if (path.startsWith('apps/web/tests/support/') || path === 'apps/web/tests/e2e/keyboard.ts' || /^apps\/web\/playwright\..*config\.ts$/.test(path)) {
            broaden(['browser-artifacts', 'browser-ui', 'browser-live'], `${path} changes shared browser fixture configuration or dependencies.`)
            code(path, 'web')
        } else if (path === 'apps/web/vitest.config.ts') {
            fullTests.add('web'); code(path, 'web', false)
            reasons.add('Shared Vitest configuration changed; the web test target runs in full.')
        } else if (path === 'apps/web/eslint.config.mjs') {
            fullLint.add('web'); reasons.add('Shared web ESLint configuration changed; the web lint target runs in full.')
        } else if (/^apps\/web\/tsconfig(?:\.[\w-]+)?\.json$/.test(path)) {
            add('web/Type check web application', 'web/Build web application'); fullTests.add('web')
            reasons.add(`${path} changes shared web compilation configuration; web types, build, and tests run.`)
        } else if (/^apps\/web\/(?:package\.json|vite\.config\.ts|index\.html)$/.test(path)) {
            broaden(['web', 'images', 'browser-artifacts', 'browser-ui', 'browser-live'], `${path} changes shared web build configuration.`)
        } else if (path === 'apps/web/src/test/setup.ts') {
            fullTests.add('web'); code(path, 'web', false)
            reasons.add('Shared web test setup changed; the web test target runs in full.')
        } else if (path.startsWith('apps/web/src/')) {
            code(path, 'web')
        } else if (path.startsWith('bruno/')) {
            const collection = path.split('/')[1]
            const label = brunoCollections[collection]
            if (!label) fail(`Bruno collection ${collection} has no mapped validation workflow step`)
            browserSetup('live', ['async-verification', 'batch-verification'].includes(collection)); add(live(label))
            const structuralTest = `scripts/bruno/${brunoStructuralTests[collection]}`
            if (structuralTest.endsWith('.spec.ts')) related.backend.push(structuralTest)
            else nodeTestFiles.push(structuralTest)
        } else if (path.startsWith('scripts/testing/') || path.startsWith('scripts/bruno/')) {
            const artifact = artifactFiles[path.split('/').at(-1)]
            if (artifact) add('browser-artifacts/Install Chromium', `browser-artifacts/${artifact}`)
            else if (/\.test\.mjs$/.test(path)) {
                if (fileExists(path)) nodeTestFiles.push(path)
                else { nodeRunners = true; reasons.add(`${path} was removed; the remaining Node tooling tests run.`) }
            }
            else if (/\.(?:spec\.)?ts$/.test(path)) code(path)
            else if (/\.mjs$/.test(path)) {
                nodeRunners = true
                if (!/web-log-privacy\.mjs$/.test(path)) broaden(['browser-artifacts', 'browser-live'], `${path} changes shared live-test orchestration.`)
            } else if (path.endsWith('proxy-fleet-vagrant-config.test.rb')) add('backend/Test Vagrant provider configuration')
            else fail(`unmapped test tooling input ${path}`)
            if (/\.[cm]?[jt]s$/.test(path)) code(path, 'backend', false)
        } else if (path.startsWith('deploy/proxy-fleet/vagrant/')) {
            add('backend/Test Vagrant provider configuration')
        } else if (path.startsWith('src/')) {
            if (!/\.[cm]?[jt]sx?$/.test(path)) fail(`unmapped backend source input ${path}`)
            code(path)
            if (path.startsWith('src/libs/common/')) code(path, 'web')
            if (path === 'src/libs/common/src/checkout-redirect.ts') add(live(liveBuild), live('Test Vite and Nginx route ownership and privacy'))
            if (!path.endsWith('.spec.ts') && (/\/(?:api|dto|dtos|domain|enums|interfaces|types|constants)\//.test(path)
                || /(?:dto|controller|enum|interface|types?)\.ts$/.test(path) || path.startsWith('src/lead-email-finder-api/'))) add('contract/Check browser API contract drift')
        } else if (path.startsWith('__mocks__/')) {
            fullTests.add('backend'); code(path, 'backend', false)
            reasons.add(`${path} changes a shared backend test mock.`)
        } else if (path.startsWith('docker/smtp-dev/') && path.endsWith('.test.mjs')) {
            if (fileExists(path)) nodeTestFiles.push(path)
            else nodeRunners = true
            code(path, 'backend', false)
        } else if (path === 'Dockerfile' || path === '.dockerignore' || path.startsWith('docker/') || path.startsWith('config/')) {
            broaden(['backend', 'images', 'browser-artifacts', 'browser-live'], `${path} changes shared runtime or container configuration.`)
        } else if (path.startsWith('.agents/')) {
            ci()
        } else fail(`unmapped changed path ${path}`)
    }

    if (lint.backend.length || fullLint.has('backend')) add('backend/Lint')
    if (lint.web.length || fullLint.has('web')) add('web/Lint web application')
    if (related.backend.length || fullTests.has('backend') || nodeRunners || nodeTestFiles.length) add(backendTest)
    if (related.web.length || fullTests.has('web')) add(webTest)

    for (const job of result.jobs) {
        const broad = fullJobs.has(job.id)
        job.steps = job.steps.filter(step => broad || selected.has(step.label)).map(step => {
            if (step.label === policy('Lint changed documentation with Harper') && changes.includes('.harper-dictionary.txt')) return rewrite(step, ['corepack pnpm docs:lint:changed', 'corepack pnpm docs:lint'], 'corepack pnpm docs:lint')
            if (broad) return step
            if (step.label === 'backend/Lint' && !fullLint.has('backend')) return rewrite(step, 'corepack pnpm lint', `corepack pnpm exec eslint -- ${[...new Set(lint.backend)].map(quote).join(' ')}`)
            if (step.label === 'web/Lint web application' && !fullLint.has('web')) return rewrite(step, `${web} lint`, `${web} exec eslint -- ${[...new Set(lint.web)].map(quote).join(' ')}`)
            if (step.label === backendTest) {
                const commands = []
                if (fullTests.has('backend')) commands.push('corepack pnpm exec jest --runInBand')
                else if (related.backend.length) commands.push(`corepack pnpm exec jest --runInBand --findRelatedTests --passWithNoTests ${[...new Set(related.backend)].map(quote).join(' ')}`)
                if (nodeRunners) commands.push(nodeRunnerCommand)
                else if (nodeTestFiles.length) commands.push(`node --test ${nodeTestFiles.map(quote).join(' ')}`)
                return rewrite(step, 'corepack pnpm test:ci', commands.join(' && '))
            }
            if (step.label === webTest && !fullTests.has('web')) return rewrite(step, `${web} test:ci --maxWorkers=2`, `${web} exec vitest related ${[...new Set(related.web)].map(quote).join(' ')} --run --maxWorkers=2 --passWithNoTests`)
            if (exactSpecs.has(step.label)) {
                const replacement = [...exactSpecs.get(step.label)].map(([config, files]) => `${web} exec playwright test --config ${quote(config)} ${[...files].map(path => quote(exactPlaywrightFilter(path))).join(' ')}`).join(' && ')
                return { ...rewrite(step, `${web} ${browserCommands[step.label]}`, replacement), label: `${step.label} (changed specifications)` }
            }
            return step
        })
        job.selected = job.steps.length > 0
        if (!job.selected || (job.id === 'browser-live' && !job.steps.some(step => step.label === live(reset)))) job.cleanup = []
        if (job.id === 'backend' && !job.steps.some(step => Object.keys(step.env).some(key => key.startsWith('TEST_') && key.endsWith('POSTGRES_URL')))) delete job.service
        job.env.VALIDATION_SELECTED = String(job.selected)
    }
    return {
        ...result, changes, reasons: [...reasons],
        backendRelatedPaths: [...new Set(related.backend)],
        backendFullTests: fullTests.has('backend') || fullJobs.has('backend'),
    }
}
