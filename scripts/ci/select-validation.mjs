import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const consumers = ['repositoryPolicy', 'backend', 'web', 'contract', 'images', 'browser']

function flags(selected = []) {
    return Object.fromEntries(consumers.map(consumer => [consumer, consumer === 'repositoryPolicy' || selected.includes(consumer)]))
}

function allConsumers() {
    return flags(consumers)
}

function isRepositoryPath(path) {
    return typeof path === 'string'
        && path.length > 0
        && !path.includes('\\')
        && ![...path].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
        && !/^[a-z]:/i.test(path)
        && path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

const webInputs = new Set(['DESIGN.md', 'UX-CONTRACT.md', 'premium-ui.json'])
// These application policies export the enum values embedded in browser DTO schemas.
const schemaPolicyInputs = new Set([
    'src/libs/modules/bff-session/src/application/browser-capability-policy.ts',
    'src/libs/modules/auth/src/application/service-client-grant-policy.ts',
])
const backendPrefixes = ['src/', 'config/', 'deploy/', 'bruno/', '__mocks__/', 'scripts/testing/', 'scripts/bruno/', 'apps/mcp-server/']

function consumersForPath(path) {
    if (webInputs.has(path)) return ['web', 'images', 'browser']
    if (path.startsWith('apps/web/') || path.startsWith('scripts/frontend/')) return ['web', 'images', 'browser']
    // Documentation has no runtime consumers, including module README and plan files.
    if (/\.md$/i.test(path) || path === '.harper-dictionary.txt' || path.startsWith('.agents/')) return []
    if (path.startsWith('packages/api-client/') || path.startsWith('scripts/openapi/')) return consumers
    // HTTP schemas consume domain models and constants as well as DTO annotations.
    if (path.startsWith('src/lead-email-finder-api/')
        || path.startsWith('src/libs/common/')
        || schemaPolicyInputs.has(path)
        || (path.startsWith('src/') && (/\/(api|openapi|domain|dto|dtos|enums|interfaces|types|constants)\//.test(path)
            || /(?:[.-](?:dto|controller|module|enum|interface|decorator|types?|constants?)|\/index)\.[cm]?ts$/.test(path)
            || /(?:^|\/)(?:main|generate-metadata|configure-api-serialization)\.ts$/.test(path)))) return consumers
    if (backendPrefixes.some(prefix => path.startsWith(prefix))) return ['backend', 'images', 'browser']
    if (path.startsWith('docker/') || path === 'Dockerfile' || path === '.dockerignore') return ['backend', 'images', 'browser']
    // Root configuration, workflows, shared scripts, and newly introduced areas fail open.
    return consumers
}

/** Only an explicitly trustworthy comparison may authorize a reduced selection. */
export function selectValidation(paths, context = {}) {
    if (context?.comparisonTrusted !== true || !Array.isArray(paths) || ![...paths].every(isRepositoryPath)) return allConsumers()
    const selected = new Set()
    for (const path of paths) {
        for (const consumer of consumersForPath(path)) selected.add(consumer)
    }
    return flags([...selected])
}

function isCommitId(value) {
    return typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value) && !/^0+$/.test(value)
}

function git(repository, args) {
    return execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 })
}

/** PRs use merge-base(base, head)..head; pushes compare before..after directly. */
export function discoverChangedPaths(eventName, event, repository = process.cwd()) {
    let base
    let head
    if (eventName === 'pull_request') {
        base = event?.pull_request?.base?.sha
        head = event?.pull_request?.head?.sha
    } else if (eventName === 'push') {
        base = event?.before
        head = event?.after
    } else {
        throw new Error('The event does not provide a supported comparison')
    }
    if (!isCommitId(base) || !isCommitId(head)) throw new Error('The comparison requires two nonzero commit IDs')
    for (const revision of [base, head]) git(repository, ['rev-parse', '--verify', `${revision}^{commit}`])
    if (eventName === 'pull_request') {
        base = git(repository, ['merge-base', '--all', base, head]).trim()
        // Multiple merge bases are ambiguous; select everything instead of choosing one.
        if (!isCommitId(base)) throw new Error('The pull request has no unique merge base')
    }
    // Disabling rename detection emits both the removed and added path. NUL separation
    // preserves whitespace and never treats a filename as shell or line-oriented code.
    const changed = git(repository, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', base, head, '--'])
    if (changed === '') return []
    if (!changed.endsWith('\0')) throw new Error('Git did not return a complete path list')
    return changed.slice(0, -1).split('\0')
}

export function selectEventValidation(eventName, event, repository = process.cwd()) {
    try {
        return selectValidation(discoverChangedPaths(eventName, event, repository), { comparisonTrusted: true })
    } catch {
        return allConsumers()
    }
}

export function runFixtures() {
    const fixtures = JSON.parse(readFileSync(new URL('./validation-fixtures.json', import.meta.url), 'utf8'))
    return fixtures.map(({ name, paths, comparisonTrusted, expected }) => {
        const actual = selectValidation(paths, { comparisonTrusted })
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Validation fixture failed: ${name}`)
        return { name, paths, comparisonTrusted, flags: actual }
    })
}

function run(args) {
    if (args.length === 1 && args[0] === '--fixtures') {
        process.stdout.write(`${JSON.stringify(runFixtures(), null, 2)}\n`)
        return
    }
    let result = allConsumers()
    try {
        if (args.length === 1 && args[0] === '--event') {
            const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
            result = selectEventValidation(process.env.GITHUB_EVENT_NAME, event)
        } else if (args.length === 2 && args[0] === '--paths-json') {
            result = selectValidation(JSON.parse(args[1]), { comparisonTrusted: true })
        } else {
            throw new Error('Expected --event, --fixtures, or --paths-json with a JSON array')
        }
    } catch {
        process.stderr.write('Validation scope is uncertain; selecting every consumer.\n')
    }
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, consumers.map(consumer => `${consumer}=${result[consumer]}\n`).join(''))
    }
    process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run(process.argv.slice(2))
