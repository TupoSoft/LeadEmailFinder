import { execFileSync, spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { discoverChangedPaths, isRepositoryPath, selectValidation } from './select-validation.mjs'
import { discoverRelatedTests } from './related-tests.mjs'

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url))
const webGuard = 'apps/web/tests/support/browser-fixture-guard.test.ts'
const webPackage = '@tuposoft/lead-email-finder-web'

function git(repository, args) {
    return execFileSync('git', args, { cwd: repository, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function pathList(output) {
    if (!output) return []
    if (!output.endsWith('\0')) throw new Error('Incomplete Git path list')
    return output.slice(0, -1).split('\0')
}

/** Include committed PR changes plus both index/worktree layers and untracked files. */
export function discoverLocalChangedPaths(base, repository = repositoryRoot) {
    const baseSha = git(repository, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim()
    const headSha = git(repository, ['rev-parse', '--verify', 'HEAD^{commit}']).trim()
    const committed = discoverChangedPaths('pull_request', { pull_request: { base: { sha: baseSha }, head: { sha: headSha } } }, repository)
    const diff = ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z']
    return [...new Set([
        ...committed,
        ...pathList(git(repository, [...diff, '--cached', 'HEAD', '--'])),
        ...pathList(git(repository, [...diff, '--'])),
        ...pathList(git(repository, ['ls-files', '--others', '--exclude-standard', '-z', '--'])),
    ])]
}

function regularFile(repository, path) {
    try {
        return lstatSync(resolve(repository, path)).isFile()
    } catch {
        return false
    }
}

function graphEligible(suite, path) {
    // Arbitrary assets, fixtures, setup, declarations, and dynamic entry points need a full run.
    if (!/^[\w ./-]+$/.test(path) || /\/(?:__[^/]+__|test|tests|fixtures?|testing)\//.test(path)
        || /(?:\.d\.ts|(?:^|\/)(?:main|index|metadata|generate-metadata|setup[^/]*|.*config)\.[cm]?tsx?)$/.test(path)) return false
    return suite === 'backend' ? /^src\/.+\.ts$/.test(path) : /^apps\/web\/src\/.+\.tsx?$/.test(path)
}

export function selectUnitTests(suite, paths, repository = repositoryRoot, comparisonTrusted = true) {
    const full = reason => ({ suite, mode: 'full', reason, paths: [] })
    if (!comparisonTrusted || !Array.isArray(paths) || !paths.every(isRepositoryPath)) return full('The change comparison is uncertain')
    const relevant = [...new Set(paths)].filter(path => selectValidation([path], { comparisonTrusted: true })[suite])
    if (relevant.length === 0) return { suite, mode: 'skip', reason: 'No changes affect this suite', paths: [] }
    if (relevant.some(path => !graphEligible(suite, path) || !regularFile(repository, path))) {
        return full('Changed configuration, shared inputs, fixtures, or missing files require the full suite')
    }
    return { suite, mode: 'related', reason: 'Existing source files can use the test dependency graph', paths: relevant }
}

/** Validate every source separately: a covered source must never hide an orphan. */
export async function resolveUnitTests(selection, repository = repositoryRoot, discover = discoverRelatedTests) {
    if (selection.mode !== 'related') return selection
    try {
        const sources = selection.paths.map(path => resolve(repository, path))
        const related = await discover(selection.suite, sources, repository)
        const tests = new Set()
        for (const source of sources) {
            const files = related.get(source)
            if (!Array.isArray(files) || files.length === 0) throw new Error('A changed source has no related tests')
            for (const file of files) {
                if (typeof file !== 'string' || resolve(file) !== file) throw new Error('Invalid test path')
                const path = relative(repository, file)
                const matchesSuite = selection.suite === 'backend'
                    ? !path.startsWith('apps/web/') && /\.spec\.ts$/.test(path)
                    : /^apps\/web\/.+\.test\.tsx?$/.test(path)
                if (!isRepositoryPath(path) || !matchesSuite || !regularFile(repository, path)) throw new Error('Invalid test file')
                tests.add(path)
            }
        }
        if (selection.suite === 'web') {
            if (!regularFile(repository, webGuard)) throw new Error('The mandatory source guard is unavailable')
            tests.add(webGuard)
        }
        return { ...selection, tests: [...tests].sort() }
    } catch {
        return { suite: selection.suite, mode: 'full', reason: 'Related-test discovery was incomplete; running the full suite', paths: [] }
    }
}

export function runUnitTests(selection, repository = repositoryRoot, execute = spawnSync) {
    if (selection.mode === 'skip') return 0
    const run = args => {
        const result = execute('corepack', ['pnpm', ...args], { cwd: repository, stdio: 'inherit' })
        return result.error || result.signal ? 1 : (result.status ?? 1)
    }
    if (selection.suite === 'backend') {
        if (selection.mode === 'full') return run(['test:ci'])
        const status = run(['exec', 'jest', '--runInBand', '--runTestsByPath', ...selection.tests.map(path => resolve(repository, path))])
        return status || run(['test:oidc-runners'])
    }
    if (selection.mode === 'full') return run(['--filter', webPackage, 'test:ci', '--maxWorkers=1'])
    // Vitest treats arguments after `--` as unknown options, not file filters.
    // Absolute paths cannot be mistaken for command-line options.
    return run(['--filter', webPackage, 'exec', 'vitest', 'run', '--maxWorkers=1', ...selection.tests.map(path => resolve(repository, path))])
}

async function main() {
    const { values } = parseArgs({ options: {
        suite: { type: 'string', default: 'all' },
        base: { type: 'string' },
        event: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
    } })
    if (!['all', 'backend', 'web'].includes(values.suite) || (values.event && values.base)) throw new Error('Use --suite all|backend|web and either --event or --base <ref>')
    let paths = []
    let trusted = true
    try {
        paths = values.event
            ? discoverChangedPaths(process.env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), repositoryRoot)
            : discoverLocalChangedPaths(values.base ?? 'origin/master', repositoryRoot)
    } catch {
        trusted = false
    }
    const suites = values.suite === 'all' ? ['backend', 'web'] : [values.suite]
    for (const suite of suites) {
        const selection = await resolveUnitTests(selectUnitTests(suite, paths, repositoryRoot, trusted), repositoryRoot)
        process.stdout.write(`${JSON.stringify(selection)}\n`)
        if (!values['dry-run']) {
            const status = runUnitTests(selection, repositoryRoot)
            if (status !== 0) return status
        }
    }
    return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().then(status => { process.exitCode = status }).catch(error => {
        process.stderr.write(`${error.message}\n`)
        process.exitCode = 1
    })
}
