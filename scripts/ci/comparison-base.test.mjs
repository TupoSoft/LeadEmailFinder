import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { resolveComparisonBase } from './comparison-base.mjs'

const first = 'a'.repeat(40)
const second = 'b'.repeat(40)

function fixture(t) {
    const repository = mkdtempSync(join(tmpdir(), 'lef-comparison-'))
    t.after(() => rmSync(repository, { recursive: true, force: true }))
    const environment = {
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', HUSKY: '0',
    }
    const invoke = (command, args, options) => spawnSync(command, args, { ...options, env: environment })
    const git = (...args) => {
        const result = invoke('git', args, { cwd: repository, encoding: 'utf8' })
        assert.equal(result.status, 0, result.stderr)
        return result.stdout.trim()
    }
    const commit = (file, contents = file) => {
        writeFileSync(join(repository, file), contents)
        git('add', '--all')
        git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture')
        return git('rev-parse', 'HEAD')
    }
    git('init', '--initial-branch=main', '--quiet')
    git('config', 'user.name', 'Comparison fixture')
    git('config', 'user.email', 'comparison@example.invalid')
    const base = commit('initial.txt')
    git('remote', 'add', 'origin', 'https://credential-sentinel@example.invalid/repository.git')
    git('update-ref', 'refs/remotes/origin/main', base)
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
    return { repository, invoke, git, commit, base }
}

test('a first push uses its unique merge base and excludes changes unique to the default branch', t => {
    const f = fixture(t)
    f.git('checkout', '--quiet', '-b', 'feature')
    const pushed = f.commit('feature.txt')
    f.git('checkout', '--quiet', 'main')
    const defaultTip = f.commit('default-only.txt')
    f.git('update-ref', 'refs/remotes/origin/main', defaultTip)
    const beforeConfig = readFileSync(join(f.repository, '.git/config'))
    const beforeRefs = f.git('show-ref')
    const commands = []
    const base = resolveComparisonBase({ commit: pushed }, {
        repository: f.repository,
        invoke: (command, args, options) => { commands.push(args); return f.invoke(command, args, options) },
    })
    assert.equal(base, f.base)
    assert.equal(f.git('diff', '--name-only', base, pushed), 'feature.txt')
    assert.equal(f.git('rev-parse', 'HEAD'), defaultTip, 'Selection uses the supplied commit rather than the checked-out HEAD')
    assert.deepEqual(readFileSync(join(f.repository, '.git/config')), beforeConfig)
    assert.equal(f.git('show-ref'), beforeRefs)
    assert(commands.every(args => ['remote', 'symbolic-ref', 'rev-parse', 'merge-base'].includes(args[0])))
})

test('manual validation still selects branch changes when the upstream already equals the pushed commit', t => {
    const f = fixture(t)
    f.git('checkout', '--quiet', '-b', 'feature')
    const pushed = f.commit('feature.txt')
    f.git('update-ref', 'refs/remotes/origin/feature', pushed)
    f.git('branch', '--set-upstream-to=origin/feature', 'feature')
    const base = resolveComparisonBase({ commit: pushed }, f)
    assert.equal(base, f.base)
    assert.equal(f.git('diff', '--name-only', base, pushed), 'feature.txt')
})

test('an explicit remote selects that remote default instead of assuming origin', t => {
    const f = fixture(t)
    f.git('remote', 'rename', 'origin', 'upstream')
    const pushed = f.commit('feature.txt')
    assert.equal(resolveComparisonBase({ commit: pushed, remote: 'upstream' }, f), f.base)
    assert.throws(() => resolveComparisonBase({ commit: pushed }, f), /configured remote/)
})

test('existing pushes keep the advertised base directly even across a history rewrite', t => {
    const f = fixture(t)
    const previousRemote = f.commit('old-feature.txt')
    f.git('checkout', '--quiet', '--detach', f.base)
    const pushed = f.commit('rewritten-feature.txt')
    assert.equal(resolveComparisonBase({ commit: pushed, base: previousRemote }, f), previousRemote)
    assert.equal(f.git('diff', '--name-only', previousRemote, pushed), 'old-feature.txt\nrewritten-feature.txt')
})

test('annotated remote tags are peeled before comparison', t => {
    const f = fixture(t)
    f.git('-c', 'tag.gpgsign=false', 'tag', '-a', 'old-release', '-m', 'Fixture')
    const tagObject = f.git('rev-parse', 'refs/tags/old-release')
    const pushed = f.commit('feature.txt')
    assert.equal(resolveComparisonBase({ commit: pushed, base: tagObject }, f), f.base)
})

test('missing advertised remote objects fail instead of substituting the default branch', t => {
    const f = fixture(t)
    assert.throws(() => resolveComparisonBase({ commit: f.base, base: second }, f), /comparison commit is unavailable/)
})

test('missing or dangling remote defaults fail with an actionable history instruction', t => {
    const f = fixture(t)
    f.git('symbolic-ref', '--delete', 'refs/remotes/origin/HEAD')
    assert.throws(() => resolveComparisonBase({ commit: f.base }, f), /git fetch <remote>.*git remote set-head/)
    f.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/missing')
    assert.throws(() => resolveComparisonBase({ commit: f.base }, f), /default tracking branch is unavailable/)
    f.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/heads/main')
    assert.throws(() => resolveComparisonBase({ commit: f.base }, f), /default tracking branch is unavailable/)
})

test('unrelated history fails rather than running a full repository scan', t => {
    const f = fixture(t)
    f.git('checkout', '--quiet', '--orphan', 'unrelated')
    f.git('rm', '--quiet', '-rf', '.')
    const pushed = f.commit('unrelated.txt')
    assert.throws(() => resolveComparisonBase({ commit: pushed }, f), /unique merge base/)
})

test('ambiguous or malformed merge-base output fails without exposing child output', () => {
    for (const output of [`${first}\n${second}\n`, '', 'credential-sentinel']) {
        const invoke = (_command, args) => ({ status: 0, stdout: {
            remote: 'origin\n', 'symbolic-ref': 'refs/remotes/origin/main\n',
            'rev-parse': `${first}\n`, 'merge-base': output,
        }[args[0]] })
        assert.throws(() => resolveComparisonBase({ commit: second }, { invoke }), error => {
            assert.match(error.message, /unique merge base/)
            assert.doesNotMatch(error.message, /credential-sentinel/)
            return true
        })
    }
})

test('unknown or unnamed remotes fail without printing a credential-bearing location', () => {
    const invoke = () => ({ status: 0, stdout: 'origin\n' })
    for (const remote of ['other', 'https://credential-sentinel@example.invalid/repository.git']) {
        assert.throws(() => resolveComparisonBase({ commit: first, remote }, { invoke }), error => {
            assert.match(error.message, /configured remote/)
            assert.doesNotMatch(error.message, /credential-sentinel/)
            return true
        })
    }
})

test('explicit all mode needs no remote history and conflicts with an explicit base', () => {
    assert.equal(resolveComparisonBase({ commit: first, all: true }, { invoke: () => assert.fail('Full validation does not discover a base') }), undefined)
    assert.throws(() => resolveComparisonBase({ commit: first, base: second, all: true }), /cannot be used together/)
    for (const base of ['HEAD', '0'.repeat(40), 'bad\ninput']) {
        assert.throws(() => resolveComparisonBase({ commit: first, base }), /complete nonzero commit SHA/)
    }
})

test('comparison subprocesses ignore enclosing Git pointers while retaining ordinary environment values', () => {
    const invoke = (_command, _args, options) => {
        assert.deepEqual(options.env, { PATH: '/bin', CI: 'true' })
        return { status: 0, stdout: first }
    }
    assert.equal(resolveComparisonBase({ commit: second, base: first }, {
        invoke,
        environment: { GIT_DIR: '/foreign/.git', GIT_WORK_TREE: '/foreign', GIT_INDEX_FILE: '/foreign/index', PATH: '/bin', CI: 'true' },
    }), first)
})
