import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, describe, test } from 'node:test'

import { discoverLocalChangedPaths, resolveUnitTests, runUnitTests, selectUnitTests } from './test-affected.mjs'

const temporaryDirectories = []
const webGuard = 'apps/web/tests/support/browser-fixture-guard.test.ts'

function directory() {
    const root = mkdtempSync(join(tmpdir(), 'lef-affected-selection-'))
    temporaryDirectories.push(root)
    return root
}

function write(root, path, content = 'export const value = 1\n') {
    const absolute = join(root, path)
    mkdirSync(dirname(absolute), { recursive: true })
    writeFileSync(absolute, content)
    return absolute
}

function git(root, ...args) {
    const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
    return execFileSync('git', args, {
        cwd: root,
        env: { ...environment, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
}

function commit(root) {
    git(root, 'add', '--all')
    git(root, '-c', 'user.name=Affected test fixture', '-c', 'user.email=ci@example.invalid',
        '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-m', 'fixture')
    return git(root, 'rev-parse', 'HEAD')
}

function cleanGitEnvironment(run) {
    // The import runs inside repository hooks too; fixtures must not inherit their index or checkout.
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith('GIT_')))
    for (const name of Object.keys(inherited)) delete process.env[name]
    try {
        return run()
    } finally {
        Object.assign(process.env, inherited)
    }
}

function repository(files = []) {
    const root = directory()
    git(root, 'init', '--initial-branch=main')
    write(root, 'README.md', 'fixture\n')
    for (const path of files) write(root, path)
    const base = commit(root)
    return { root, base }
}

function sourceFixture(suite) {
    const root = directory()
    const source = suite === 'backend' ? 'src/feature/value.ts' : 'apps/web/src/feature/value.ts'
    const spec = suite === 'backend' ? 'src/feature/value.spec.ts' : 'apps/web/src/feature/value.test.ts'
    write(root, source)
    write(root, spec)
    if (suite === 'web') write(root, webGuard)
    return { root, source, spec, selection: selectUnitTests(suite, [source], root) }
}

after(() => {
    for (const root of temporaryDirectories) rmSync(root, { recursive: true, force: true })
})

describe('local affected comparison', () => {
    test('uses the merge base, includes every PR commit and all local layers, and excludes base-only changes', () => {
        const { root } = repository(['src/staged.ts', 'src/unstaged.ts', 'src/both.ts'])
        git(root, 'checkout', '-b', 'feature')
        write(root, 'src/first-commit.ts')
        commit(root)
        write(root, 'apps/web/src/second-commit.tsx')
        commit(root)
        git(root, 'checkout', 'main')
        write(root, 'src/base-only.ts')
        commit(root)
        git(root, 'checkout', 'feature')
        write(root, 'src/staged.ts', 'export const staged = true\n')
        write(root, 'src/both.ts', 'export const staged = true\n')
        git(root, 'add', 'src/staged.ts', 'src/both.ts')
        write(root, 'src/unstaged.ts', 'export const unstaged = true\n')
        write(root, 'src/both.ts', 'export const unstaged = true\n')
        write(root, 'apps/web/src/untracked file.tsx')

        const paths = cleanGitEnvironment(() => discoverLocalChangedPaths('main', root))
        assert.deepEqual(paths.sort(), [
            'apps/web/src/second-commit.tsx', 'apps/web/src/untracked file.tsx', 'src/both.ts',
            'src/first-commit.ts', 'src/staged.ts', 'src/unstaged.ts',
        ].sort())
        assert.equal(new Set(paths).size, paths.length)
    })

    test('retains a deletion and both sides of a staged rename so missing sources force full validation', () => {
        const { root, base } = repository(['src/deleted.ts', 'src/old.ts'])
        git(root, 'mv', 'src/old.ts', 'src/renamed.ts')
        rmSync(join(root, 'src/deleted.ts'))
        const paths = cleanGitEnvironment(() => discoverLocalChangedPaths(base, root))
        assert.deepEqual(paths.sort(), ['src/renamed.ts', 'src/deleted.ts', 'src/old.ts'].sort())
        assert.equal(selectUnitTests('backend', paths, root).mode, 'full')
        assert.equal(selectUnitTests('web', paths, root).mode, 'skip')
    })

    test('a committed web rename preserves the removed source and requires the full web suite', () => {
        const { root, base } = repository(['apps/web/src/old.ts'])
        git(root, 'mv', 'apps/web/src/old.ts', 'apps/web/src/renamed.ts')
        commit(root)
        const paths = cleanGitEnvironment(() => discoverLocalChangedPaths(base, root))
        assert.deepEqual(paths.sort(), ['apps/web/src/old.ts', 'apps/web/src/renamed.ts'])
        assert.equal(selectUnitTests('web', paths, root).mode, 'full')
    })

    test('rejects an unavailable base instead of inventing an empty comparison', () => {
        const { root } = repository()
        assert.throws(() => cleanGitEnvironment(() => discoverLocalChangedPaths('unavailable-reference', root)))
    })

    test('does not mutate a fixture checkout while discovering paths', () => {
        const { root, base } = repository(['src/value.ts'])
        write(root, 'src/value.ts', 'changed worktree contents\n')
        const state = ['HEAD', 'config', 'index', 'refs/heads/main'].map(path => join(root, '.git', path))
        const before = state.map(path => readFileSync(path))
        cleanGitEnvironment(() => discoverLocalChangedPaths(base, root))
        for (const [index, path] of state.entries()) assert.deepEqual(readFileSync(path), before[index])
        assert.equal(readFileSync(join(root, 'src/value.ts'), 'utf8'), 'changed worktree contents\n')
    })
})

describe('affected suite eligibility', () => {
    test('ordinary source and changed tests remain eligible while unrelated paths do not widen them', () => {
        for (const suite of ['backend', 'web']) {
            const { root, source, spec } = sourceFixture(suite)
            const selection = selectUnitTests(suite, [source, spec, source, 'docs/guide.md'], root)
            assert.equal(selection.mode, 'related')
            assert.deepEqual(selection.paths.sort(), [source, spec].sort())
        }
    })

    test('a trusted irrelevant comparison skips execution and an uncertain one requests the full suite', () => {
        const root = directory()
        for (const suite of ['backend', 'web']) {
            assert.equal(selectUnitTests(suite, ['README.md'], root).mode, 'skip')
            assert.equal(selectUnitTests(suite, [], root).mode, 'skip')
            assert.equal(selectUnitTests(suite, [], root, false).mode, 'full')
            for (const paths of [null, 'src/value.ts', ['../src/value.ts'], ['/tmp/source.ts'], ['src/value\n.ts']]) {
                assert.equal(selectUnitTests(suite, paths, root).mode, 'full')
            }
        }
    })

    test('configuration, shared inputs, fixtures, unsupported assets, and missing source force a full run', () => {
        const common = ['pnpm-lock.yaml', 'package.json', 'jest.config.ts', '.github/workflows/validate.yml',
            'packages/api-client/src/schema.d.ts', 'scripts/ci/test-affected.mjs']
        const inputs = {
            backend: [...common, 'src/main.ts', 'src/metadata.ts', 'src/lead-email-finder-api/src/generate-metadata.ts',
                'src/config.ts', 'src/feature/index.ts', 'src/testing/fake.ts', 'src/fixtures/data.ts',
                'src/feature/value.d.ts', 'src/feature/unsupported.json', 'src/feature/missing.ts'],
            web: [...common, 'apps/web/vite.config.ts', 'apps/web/vitest.config.ts', 'apps/web/src/main.tsx',
                'apps/web/src/test/setup.ts', 'apps/web/tests/support/fixture.ts', 'apps/web/src/feature/value.d.ts',
                'apps/web/src/feature/style.css', 'apps/web/src/feature/missing.ts'],
        }
        for (const [suite, paths] of Object.entries(inputs)) {
            const { root, source } = sourceFixture(suite)
            for (const path of paths) {
                if (!path.endsWith('/missing.ts')) write(root, path)
                assert.equal(selectUnitTests(suite, [source, path], root).mode, 'full', `${suite}: ${path}`)
            }
        }
    })

    test('source symlinks and command or pattern characters cannot enter reduced runner arguments', () => {
        const { root, source } = sourceFixture('backend')
        symlinkSync(resolve(root, source), join(root, 'src/link.ts'))
        for (const path of ['src/link.ts', 'src/value[1].ts', 'src/$(touch sentinel).ts', 'src/value;command.ts']) {
            if (path !== 'src/link.ts') write(root, path)
            assert.equal(selectUnitTests('backend', [path], root).mode, 'full', path)
        }
    })
})

describe('per-source dependency coverage', () => {
    test('unions and deduplicates valid related tests while including a changed test itself', async () => {
        const { root, source, spec } = sourceFixture('backend')
        const transitive = write(root, 'src/consumer/transitive.spec.ts')
        const selection = selectUnitTests('backend', [source, spec], root)
        const resolved = await resolveUnitTests(selection, root, async (suite, sources, repositoryRoot) => {
            assert.equal(suite, 'backend')
            assert.equal(repositoryRoot, root)
            assert.deepEqual(sources, [resolve(root, source), resolve(root, spec)])
            return new Map(sources.map(path => [path, [resolve(root, spec), transitive, transitive]]))
        })
        assert.equal(resolved.mode, 'related')
        assert.deepEqual(resolved.tests, ['src/consumer/transitive.spec.ts', spec].sort())
    })

    test('a covered file never hides an orphan in a mixed change', async () => {
        const { root, source, spec } = sourceFixture('backend')
        const orphan = 'src/orphan.ts'
        write(root, orphan)
        const selection = selectUnitTests('backend', [source, orphan], root)
        for (const orphanResult of [[], undefined]) {
            const resolved = await resolveUnitTests(selection, root, async () => new Map([
                [resolve(root, source), [resolve(root, spec)]], [resolve(root, orphan), orphanResult],
            ]))
            assert.equal(resolved.mode, 'full')
            assert.equal(resolved.tests, undefined)
        }
    })

    test('discovery failures and malformed, missing, cross-suite, or external test paths request a full run', async () => {
        const { root, source, selection } = sourceFixture('backend')
        const webTest = write(root, 'apps/web/src/other.test.ts')
        const nonTest = write(root, 'src/not-a-test.ts')
        const external = write(directory(), 'outside.spec.ts')
        const invalidResults = [null, {}, new Map(), new Map([[resolve(root, source), 'not an array']]),
            ...[[42], ['src/relative.spec.ts'], [resolve(root, 'src/missing.spec.ts')], [webTest], [nonTest], [external]]
                .map(files => new Map([[resolve(root, source), files]]))]
        for (const result of invalidResults) {
            assert.equal((await resolveUnitTests(selection, root, async () => result)).mode, 'full')
        }
        assert.equal((await resolveUnitTests(selection, root, async () => { throw new Error('runner unavailable') })).mode, 'full')
    })

    test('reduced web execution always includes the filesystem source guard and fails open when it is missing', async () => {
        const { root, source, spec, selection } = sourceFixture('web')
        const discover = async () => new Map([[resolve(root, source), [resolve(root, spec)]]])
        const resolved = await resolveUnitTests(selection, root, discover)
        assert.equal(resolved.mode, 'related')
        assert.deepEqual(resolved.tests, [spec, webGuard].sort())
        rmSync(resolve(root, webGuard))
        assert.equal((await resolveUnitTests(selection, root, discover)).mode, 'full')
    })

    test('full and skipped selections never require a dependency graph', async () => {
        for (const mode of ['full', 'skip']) {
            const selection = { suite: 'backend', mode, reason: 'fixture', paths: [] }
            const resolved = await resolveUnitTests(selection, directory(), () => assert.fail('unexpected discovery'))
            assert.equal(resolved, selection)
        }
    })
})

describe('selected execution and failure propagation', () => {
    function execution(results) {
        const calls = []
        const execute = (...args) => {
            calls.push(args)
            assert.ok(results.length > 0, 'unexpected additional process')
            return results.shift()
        }
        return { calls, execute }
    }

    test('backend related success retains the complete Node runner chain', () => {
        const root = directory()
        const runner = execution([{ status: 0 }, { status: 0 }])
        assert.equal(runUnitTests({ suite: 'backend', mode: 'related', tests: ['src/feature/value.spec.ts'] }, root, runner.execute), 0)
        assert.equal(runner.calls.length, 2)
        assert.ok(runner.calls[0][1].includes('--runTestsByPath'))
        assert.ok(runner.calls[0][1].includes(resolve(root, 'src/feature/value.spec.ts')))
        assert.deepEqual(runner.calls[1][1], ['pnpm', 'test:oidc-runners'])
        assert.ok(runner.calls.every(([program, , options]) => program === 'corepack' && options.cwd === root && options.stdio === 'inherit'))
    })

    test('backend full execution delegates to the existing full Jest and Node command', () => {
        const runner = execution([{ status: 0 }])
        assert.equal(runUnitTests({ suite: 'backend', mode: 'full' }, directory(), runner.execute), 0)
        assert.deepEqual(runner.calls[0][1], ['pnpm', 'test:ci'])
    })

    test('unit failure stops the backend chain and the Node runner failure is preserved', () => {
        const selection = { suite: 'backend', mode: 'related', tests: ['src/value.spec.ts'] }
        const failingUnit = execution([{ status: 7 }])
        assert.equal(runUnitTests(selection, directory(), failingUnit.execute), 7)
        assert.equal(failingUnit.calls.length, 1)
        const failingNode = execution([{ status: 0 }, { status: 9 }])
        assert.equal(runUnitTests(selection, directory(), failingNode.execute), 9)
        assert.equal(failingNode.calls.length, 2)
    })

    test('launch errors, signals, and absent exit codes cannot report success', () => {
        for (const result of [{ error: new Error('spawn failed'), status: 0 }, { signal: 'SIGTERM', status: null }, { status: null }]) {
            const runner = execution([result])
            assert.equal(runUnitTests({ suite: 'backend', mode: 'full' }, directory(), runner.execute), 1)
        }
    })

    test('web failures propagate in both modes and a related filename with spaces remains one literal argument', () => {
        const root = directory()
        for (const mode of ['full', 'related']) {
            const runner = execution([{ status: 3 }])
            assert.equal(runUnitTests({ suite: 'web', mode, tests: ['apps/web/src/value with spaces.test.ts'] }, root, runner.execute), 3)
            assert.equal(runner.calls.length, 1)
            const args = runner.calls[0][1]
            assert.ok(args.includes('--maxWorkers=1'))
            if (mode === 'related') assert.equal(args.at(-1), resolve(root, 'apps/web/src/value with spaces.test.ts'))
        }
    })

    test('a skipped suite launches no child process', () => {
        assert.equal(runUnitTests({ suite: 'backend', mode: 'skip' }, directory(), () => assert.fail('unexpected process')), 0)
    })
})
