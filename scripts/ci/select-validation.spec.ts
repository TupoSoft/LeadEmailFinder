import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

type Selection = Record<'repositoryPolicy' | 'backend' | 'web' | 'contract' | 'images' | 'browser', boolean>
interface Fixture {
    name: string
    paths: string[]
    comparisonTrusted: boolean
    expected: Selection
}

const script = resolve(__dirname, 'select-validation.mjs')
const fixtures = JSON.parse(readFileSync(resolve(__dirname, 'validation-fixtures.json'), 'utf8')) as Fixture[]
const all: Selection = { repositoryPolicy: true, backend: true, web: true, contract: true, images: true, browser: true }
const policy: Selection = { repositoryPolicy: true, backend: false, web: false, contract: false, images: false, browser: false }
const backend: Selection = { repositoryPolicy: true, backend: true, web: false, contract: false, images: true, browser: true }
const web: Selection = { repositoryPolicy: true, backend: false, web: true, contract: false, images: true, browser: true }
const mixed: Selection = { repositoryPolicy: true, backend: true, web: true, contract: false, images: true, browser: true }
const temporaryDirectories: string[] = []

function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), 'lef-ci-paths-'))
    temporaryDirectories.push(directory)
    return directory
}

function isolatedGitEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    // Hooks can export repository/index/configuration pointers. A fixture's cwd
    // alone does not stop Git from reading or modifying that enclosing repository.
    const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
    return { ...environment, ...overrides }
}

function invoke(args: string[], cwd = process.cwd(), environment: NodeJS.ProcessEnv = {}): string {
    return execFileSync(process.execPath, args, {
        cwd,
        env: isolatedGitEnvironment({ GITHUB_OUTPUT: undefined, ...environment }),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    })
}

function invokeExport(name: string, args: unknown[]): unknown {
    return JSON.parse(invoke([
        '--input-type=module', '--eval',
        'const mod = await import((await import("node:url")).pathToFileURL(process.argv[2])); process.stdout.write(JSON.stringify(mod[process.argv[3]](...JSON.parse(process.argv[4]))));',
        'select-validation-test', script, name, JSON.stringify(args),
    ])) as unknown
}

function git(repository: string, ...args: string[]): string {
    return execFileSync('git', args, {
        cwd: repository,
        env: isolatedGitEnvironment({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
}

function write(repository: string, path: string, text = path): void {
    mkdirSync(dirname(join(repository, path)), { recursive: true })
    writeFileSync(join(repository, path), text)
}

function commit(repository: string, message = 'fixture'): string {
    git(repository, 'add', '--all')
    git(repository, '-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid', '-c', 'commit.gpgsign=false',
        '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-m', message)
    return git(repository, 'rev-parse', 'HEAD')
}

function repository(): { directory: string; base: string } {
    const directory = temporaryDirectory()
    git(directory, 'init', '--initial-branch=main')
    write(directory, 'README.md', 'base')
    return { directory, base: commit(directory) }
}

function eventSelection(directory: string, name: string, event: unknown, environment: NodeJS.ProcessEnv = {}): Selection {
    const eventPath = join(temporaryDirectory(), 'event.json')
    writeFileSync(eventPath, JSON.stringify(event))
    return JSON.parse(invoke([script, '--event'], directory, {
        GITHUB_EVENT_NAME: name, GITHUB_EVENT_PATH: eventPath, ...environment,
    })) as Selection
}

afterAll(() => {
    for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true })
})

describe('validation path classification', () => {
    test.each(fixtures)('$name selects the complete expected consumer set', fixture => {
        expect(invokeExport('selectValidation', [fixture.paths, { comparisonTrusted: fixture.comparisonTrusted }])).toEqual(fixture.expected)
    })

    test.each([null, {}, 'README.md', [null], [42], [''], ['a//b'], ['a/'], ['../README.md'], ['\\server\\share'], ['a\0b']])(
        'invalid path input %j selects every consumer', paths => {
            expect(invokeExport('selectValidation', [paths, { comparisonTrusted: true }])).toEqual(all)
        },
    )

    test('comparison trust must be explicitly true', () => {
        expect(invokeExport('selectValidation', [[]])).toEqual(all)
        for (const context of [null, true, [], { comparisonTrusted: 'true' }]) {
            expect(invokeExport('selectValidation', [[], context])).toEqual(all)
        }
    })

    test('duplicate and reordered paths do not change the complete selection', () => {
        const paths = ['README.md', 'apps/web/src/main.tsx', 'src/libs/socket/src/socket.ts']
        expect(invokeExport('selectValidation', [paths, { comparisonTrusted: true }])).toEqual(mixed)
        expect(invokeExport('selectValidation', [[...paths.reverse(), ...paths], { comparisonTrusted: true }])).toEqual(mixed)
    })

    test('the fixtures command checks expectations and emits deterministic JSON with explicit booleans', () => {
        const output = invoke([script, '--fixtures'])
        expect(invoke([script, '--fixtures'])).toBe(output)
        expect(JSON.parse(output)).toEqual(fixtures.map(({ name, paths, comparisonTrusted, expected }) => ({
            name, paths, comparisonTrusted, flags: expected,
        })))
        for (const { expected } of fixtures) {
            expect(Object.keys(expected)).toEqual(Object.keys(all))
            expect(Object.values(expected).every(value => typeof value === 'boolean')).toBe(true)
        }
    })

    test.each(['not json', '{}', 'null'])('the paths CLI fails open for %s', input => {
        expect(JSON.parse(invoke([script, '--paths-json', input]))).toEqual(all)
    })

    test('the paths CLI treats an explicit empty list as trusted', () => {
        expect(JSON.parse(invoke([script, '--paths-json', '[]']))).toEqual(policy)
    })
})

describe('GitHub comparison discovery', () => {
    test('fixture Git and event subprocesses ignore an enclosing hook repository and preserve its state', () => {
        const outer = repository()
        const outerPaths = ['HEAD', 'config', 'index', 'refs/heads/main'].map(path => join(outer.directory, '.git', path))
        const originalFiles = outerPaths.map(path => readFileSync(path))
        const hookEnvironment = {
            GIT_DIR: join(outer.directory, '.git'),
            GIT_WORK_TREE: outer.directory,
            GIT_INDEX_FILE: join(outer.directory, '.git/index'),
            GIT_COMMON_DIR: join(outer.directory, '.git'),
            GIT_CONFIG_COUNT: '1',
            GIT_CONFIG_KEY_0: 'core.bare',
            GIT_CONFIG_VALUE_0: 'true',
        }
        const originalEnvironment = Object.fromEntries(Object.keys(hookEnvironment).map(name => [name, process.env[name]]))
        try {
            Object.assign(process.env, hookEnvironment)
            const inner = repository()
            expect(git(inner.directory, 'rev-parse', '--show-toplevel')).toBe(inner.directory)
            write(inner.directory, 'apps/web/src/main.tsx')
            const after = commit(inner.directory)
            expect(eventSelection(inner.directory, 'push', { before: inner.base, after })).toEqual(web)
            expect(git(outer.directory, 'rev-parse', 'HEAD')).toBe(outer.base)
            for (const [index, path] of outerPaths.entries()) expect(readFileSync(path)).toEqual(originalFiles[index])
        } finally {
            for (const [name, value] of Object.entries(originalEnvironment)) {
                if (value === undefined) delete process.env[name]
                else process.env[name] = value
            }
        }
    })

    test('pull requests use the merge base and ignore changes unique to the base branch', () => {
        const { directory, base: common } = repository()
        git(directory, 'checkout', '-b', 'feature')
        write(directory, 'apps/web/src/main.tsx')
        const head = commit(directory)
        git(directory, 'checkout', 'main')
        write(directory, 'src/libs/socket/src/socket.ts')
        const base = commit(directory)
        expect(git(directory, 'merge-base', base, head)).toBe(common)
        const event = { pull_request: { base: { sha: base }, head: { sha: head } } }
        expect(eventSelection(directory, 'pull_request', event)).toEqual(web)
        expect(invokeExport('discoverChangedPaths', ['pull_request', event, directory])).toEqual(['apps/web/src/main.tsx'])
    })

    test('pushes compare the before and after commits directly even after a history rewrite', () => {
        const { directory } = repository()
        git(directory, 'checkout', '-b', 'feature')
        write(directory, 'apps/web/src/main.tsx')
        const after = commit(directory)
        git(directory, 'checkout', 'main')
        write(directory, 'src/libs/socket/src/socket.ts')
        const before = commit(directory)
        expect(eventSelection(directory, 'push', { before, after })).toEqual(mixed)
    })

    test('identical trustworthy revisions select repository policy only', () => {
        const { directory, base } = repository()
        expect(eventSelection(directory, 'push', { before: base, after: base })).toEqual(policy)
        expect(eventSelection(directory, 'pull_request', { pull_request: { base: { sha: base }, head: { sha: base } } })).toEqual(policy)
    })

    test('deletions select the consumer of the removed path', () => {
        const { directory } = repository()
        write(directory, 'src/libs/socket/src/socket.ts')
        const before = commit(directory)
        rmSync(join(directory, 'src/libs/socket/src/socket.ts'))
        const after = commit(directory)
        expect(eventSelection(directory, 'push', { before, after })).toEqual(backend)
    })

    test('renames select both the old and new path consumers', () => {
        const { directory } = repository()
        write(directory, 'src/libs/socket/src/socket.ts', 'same content')
        const before = commit(directory)
        mkdirSync(join(directory, 'apps/web/src'), { recursive: true })
        renameSync(join(directory, 'src/libs/socket/src/socket.ts'), join(directory, 'apps/web/src/main.tsx'))
        const after = commit(directory)
        expect(git(directory, 'diff', '--name-status', '--find-renames', before, after)).toContain('R100')
        expect(eventSelection(directory, 'push', { before, after })).toEqual(mixed)
        expect(invokeExport('discoverChangedPaths', ['push', { before, after }, directory])).toEqual([
            'apps/web/src/main.tsx', 'src/libs/socket/src/socket.ts',
        ])
    })

    test('filenames with spaces and shell metacharacters remain literal and cannot inject job outputs', () => {
        const { directory, base: before } = repository()
        const path = 'docs/$(touch SHOULD_NOT_EXIST); `touch ALSO_NOT_CREATED` guide.md'
        write(directory, path)
        const after = commit(directory)
        const output = join(temporaryDirectory(), 'github-output')
        expect(eventSelection(directory, 'push', { before, after }, { GITHUB_OUTPUT: output })).toEqual(policy)
        expect(readFileSync(output, 'utf8')).toBe(Object.entries(policy).map(([key, value]) => `${key}=${value}\n`).join(''))
        expect(existsSync(join(directory, 'SHOULD_NOT_EXIST'))).toBe(false)
        expect(existsSync(join(directory, 'ALSO_NOT_CREATED'))).toBe(false)
        expect(invokeExport('discoverChangedPaths', ['push', { before, after }, directory])).toEqual([path])
    })

    test('a changed filename containing a newline selects every consumer', () => {
        const { directory, base: before } = repository()
        write(directory, 'docs/guide\nbackend=false.md')
        const after = commit(directory)
        expect(eventSelection(directory, 'push', { before, after })).toEqual(all)
    })

    test('manual and unsupported events always select every consumer', () => {
        const { directory, base } = repository()
        for (const name of ['workflow_dispatch', 'schedule', 'pull_request_target', 'unknown']) {
            expect(eventSelection(directory, name, { before: base, after: base })).toEqual(all)
        }
    })

    test('missing, all-zero, malformed, and unresolved commit IDs select every consumer', () => {
        const { directory, base } = repository()
        for (const before of [undefined, '0'.repeat(40), 'f'.repeat(40), 'HEAD', '-h', '$(touch SHOULD_NOT_EXIST)', 42]) {
            expect(eventSelection(directory, 'push', { before, after: base })).toEqual(all)
            expect(eventSelection(directory, 'pull_request', { pull_request: { base: { sha: before }, head: { sha: base } } })).toEqual(all)
        }
        expect(eventSelection(directory, 'push', { before: base, after: '0'.repeat(40) })).toEqual(all)
        expect(existsSync(join(directory, 'SHOULD_NOT_EXIST'))).toBe(false)
    })

    test('pull requests with unrelated histories select every consumer', () => {
        const { directory, base } = repository()
        git(directory, 'checkout', '--orphan', 'unrelated')
        write(directory, 'README.md', 'unrelated root')
        const head = commit(directory)
        expect(eventSelection(directory, 'pull_request', { pull_request: { base: { sha: base }, head: { sha: head } } })).toEqual(all)
    })

    test('pull requests with multiple merge bases select every consumer', () => {
        const { directory, base: root } = repository()
        const tree = git(directory, 'rev-parse', 'HEAD^{tree}')
        function mergeCommit(message: string, parents: string[]): string {
            return git(directory, '-c', 'user.name=CI fixture', '-c', 'user.email=ci@example.invalid',
                'commit-tree', tree, ...parents.flatMap(parent => ['-p', parent]), '-m', message)
        }
        const left = mergeCommit('left', [root])
        const right = mergeCommit('right', [root])
        const base = mergeCommit('base merge', [left, right])
        const head = mergeCommit('head merge', [right, left])
        expect(git(directory, 'merge-base', '--all', base, head).split('\n')).toHaveLength(2)
        expect(eventSelection(directory, 'pull_request', { pull_request: { base: { sha: base }, head: { sha: head } } })).toEqual(all)
    })

    test('missing repository history selects every consumer', () => {
        expect(eventSelection(temporaryDirectory(), 'push', { before: '1'.repeat(40), after: '2'.repeat(40) })).toEqual(all)
    })

    test('unreadable and malformed event files select every consumer', () => {
        const directory = temporaryDirectory()
        const eventPath = join(directory, 'event.json')
        for (const payload of [undefined, 'malformed JSON', 'null', '[]', '{}']) {
            if (payload !== undefined) writeFileSync(eventPath, payload)
            expect(JSON.parse(invoke([script, '--event'], directory, {
                GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: eventPath,
            }))).toEqual(all)
        }
    })
})
