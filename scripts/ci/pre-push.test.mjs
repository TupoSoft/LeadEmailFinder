import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { parsePushUpdates, runPrePush } from './pre-push.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const first = 'a'.repeat(40)
const second = 'b'.repeat(40)
const missing = 'c'.repeat(40)
const zeros = '0'.repeat(40)
const remoteArgs = ['origin', 'https://credential-sentinel@example.invalid/repository.git']

function update(localSha = second, remoteSha = first, localRef = 'refs/heads/main', remoteRef = localRef) {
    return `${localRef} ${localSha} ${remoteRef} ${remoteSha}\n`
}

function harness(overrides = {}) {
    const calls = []
    const messages = []
    const invoke = (command, args, options) => {
        calls.push({ command, args, options })
        if (command === 'git' && args[0] === 'rev-parse') {
            const revision = args[2].replace(/\^\{commit\}$/, '')
            return revision === missing ? { status: 128, stdout: '' } : { status: 0, stdout: `${revision}\n` }
        }
        return { status: 0 }
    }
    return {
        calls,
        messages,
        run: input => runPrePush({
            input,
            remoteArgs,
            repository: root,
            invoke,
            stderr: { write: message => messages.push(message) },
            ...overrides,
        }),
    }
}

test('parses every update, including deletions and SHA-256 repositories', () => {
    const deletion = update(zeros, first, '(delete)', 'refs/heads/old')
    assert.equal(parsePushUpdates(Buffer.from(update() + deletion)).length, 2)
    const longUpdate = update('a'.repeat(64), '0'.repeat(64))
    assert.equal(parsePushUpdates(longUpdate)[0].localSha.length, 64)
    assert.deepEqual(parsePushUpdates(''), [])
})

test('rejects malformed updates before invoking a subprocess and hides input contents', () => {
    for (const input of [
        null,
        'credential-sentinel\n',
        `${update()}\n`,
        update().replace(first, 'HEAD'),
        update().replace('refs/heads/main', 'refs/heads/secret\tvalue'),
        update().replace('refs/heads/main', 'refs/heads/secret\0value'),
        update().replace(first, 'b'.repeat(64)),
        update(zeros, zeros),
        update() + 'credential-sentinel',
    ]) {
        const fixture = harness()
        assert.equal(fixture.run(input), 1)
        assert.deepEqual(fixture.calls, [])
        assert.doesNotMatch(fixture.messages.join(''), /credential-sentinel/)
    }
})

test('validates the pushed commit and base before forwarding exact stdin and remote args to LFS', () => {
    const fixture = harness()
    const input = Buffer.from(update())
    assert.equal(fixture.run(input), 0)
    const validation = fixture.calls.find(call => call.command === process.execPath)
    assert.deepEqual(validation.args, [resolve(root, 'scripts/ci/local-validation.mjs'), '--commit', second, '--base', first])
    assert.equal(validation.options.stdio[0], 'ignore')
    const lfs = fixture.calls.at(-1)
    assert.equal(lfs.command, 'git')
    assert.deepEqual(lfs.args, ['lfs', 'pre-push', ...remoteArgs])
    assert.equal(lfs.options.input, input)
    assert.deepEqual(lfs.options.stdio, ['pipe', 'inherit', 'inherit'])
    assert.deepEqual(fixture.messages, [])
})

test('deletion-only and empty updates reach LFS without validation', () => {
    for (const input of ['', update(zeros, first, '(delete)', 'refs/heads/old')]) {
        const fixture = harness()
        assert.equal(fixture.run(input), 0)
        assert.equal(fixture.calls.length, 1)
        assert.deepEqual(fixture.calls[0].args, ['lfs', 'pre-push', ...remoteArgs])
        assert.equal(fixture.calls[0].options.input, input)
    }
})

test('new branches and unavailable remote objects omit the baseline for full validation', () => {
    for (const remoteSha of [zeros, missing]) {
        const fixture = harness()
        assert.equal(fixture.run(update(second, remoteSha)), 0)
        const validation = fixture.calls.find(call => call.command === process.execPath)
        assert.deepEqual(validation.args, [resolve(root, 'scripts/ci/local-validation.mjs'), '--commit', second])
    }
})

test('deduplicates identical comparisons and validates every distinct commit/base pair', () => {
    const fixture = harness()
    const input = update() + update(second, first, 'refs/heads/other') + update(first, second) + update(second, zeros)
    assert.equal(fixture.run(input), 0)
    const validations = fixture.calls.filter(call => call.command === process.execPath)
    assert.equal(validations.length, 3)
    assert.deepEqual(validations.map(call => call.args.slice(1)), [
        ['--commit', second, '--base', first],
        ['--commit', first, '--base', second],
        ['--commit', second],
    ])
    assert.equal(fixture.calls.filter(call => call.args[0] === 'lfs').length, 1)
})

test('unresolvable pushed objects stop all validation and LFS work', () => {
    const fixture = harness()
    assert.equal(fixture.run(update() + update(missing)), 1)
    assert.equal(fixture.calls.every(call => call.args[0] === 'rev-parse'), true)
    assert.match(fixture.messages.join(''), /does not resolve/)
    assert.doesNotMatch(fixture.messages.join(''), /credential-sentinel/)
})

test('validation failures stop subsequent comparisons and LFS while preserving the exit code', () => {
    const calls = []
    const fixture = harness({ invoke: (command, args) => {
        calls.push({ command, args })
        return command === 'git'
            ? { status: 0, stdout: args[2].replace(/\^\{commit\}$/, '') }
            : { status: 17 }
    } })
    assert.equal(fixture.run(update() + update(first, second)), 17)
    assert.equal(calls.filter(call => call.command === process.execPath).length, 1)
    assert.equal(calls.some(call => call.args[0] === 'lfs'), false)
    assert.match(fixture.messages.join(''), /Local validation failed/)
})

test('missing or terminated validation processes fail the push', () => {
    for (const result of [{ status: null, error: new Error('credential-sentinel') }, { status: null, signal: 'SIGTERM' }]) {
        const fixture = harness({ invoke: (command, args) => command === 'git'
            ? { status: 0, stdout: args[2].replace(/\^\{commit\}$/, '') }
            : result })
        assert.equal(fixture.run(update()), 1)
        assert.doesNotMatch(fixture.messages.join(''), /credential-sentinel/)
    }
})

test('LFS failures propagate without printing the remote location', () => {
    for (const result of [{ status: 23 }, { status: null, error: new Error('credential-sentinel') }]) {
        const fixture = harness({ invoke: () => result })
        assert.equal(fixture.run(''), result.status ?? 1)
        assert.match(fixture.messages.join(''), /Git LFS failed/)
        assert.doesNotMatch(fixture.messages.join(''), /credential-sentinel/)
    }
})

test('invalid remote arguments fail without exposing their contents', () => {
    for (const args of [undefined, [], ['credential-sentinel'], ['origin', ''], ['origin', 'a\0b']]) {
        const fixture = harness({ remoteArgs: args })
        assert.equal(fixture.run(update()), 1)
        assert.deepEqual(fixture.calls, [])
        assert.doesNotMatch(fixture.messages.join(''), /credential-sentinel/)
    }
})

function isolatedEnvironment(overrides = {}) {
    return {
        ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        ...overrides,
    }
}

function directoryFixture(t) {
    const directory = mkdtempSync(join(tmpdir(), 'lef-pre-push-'))
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    return directory
}

test('real Git peels annotated tags and validates commits other than the dirty checkout HEAD', t => {
    const repository = directoryFixture(t)
    const env = isolatedEnvironment()
    const git = (...args) => {
        const result = spawnSync('git', args, { cwd: repository, env, encoding: 'utf8' })
        assert.equal(result.status, 0, result.stderr)
        return result.stdout.trim()
    }
    git('init', '--initial-branch=main')
    git('config', 'user.name', 'Hook fixture')
    git('config', 'user.email', 'hook@example.invalid')
    const commit = text => {
        writeFileSync(join(repository, 'fixture.txt'), text)
        git('add', 'fixture.txt')
        git('-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Fixture')
        return git('rev-parse', 'HEAD')
    }
    const older = commit('first')
    git('-c', 'tag.gpgsign=false', 'tag', '-a', 'fixture-tag', '-m', 'Fixture', older)
    const tag = git('rev-parse', 'refs/tags/fixture-tag')
    const newer = commit('second')
    writeFileSync(join(repository, 'fixture.txt'), 'uncommitted work')
    writeFileSync(join(repository, 'untracked.txt'), 'untracked work')
    const indexBefore = readFileSync(join(repository, '.git/index'))
    const nonGitCalls = []
    const input = update(tag, newer, 'refs/tags/fixture-tag') + update(older, newer, 'refs/heads/older')
    const result = runPrePush({
        input,
        remoteArgs,
        repository,
        invoke: (command, args, options) => {
            if (command === 'git' && args[0] === 'rev-parse') return spawnSync(command, args, { ...options, env })
            nonGitCalls.push({ command, args, options })
            return { status: 0 }
        },
    })
    assert.equal(result, 0)
    assert.deepEqual(nonGitCalls[0].args, [resolve(repository, 'scripts/ci/local-validation.mjs'), '--commit', older, '--base', newer])
    assert.equal(nonGitCalls.length, 2, 'The tag and branch resolve to the same comparison and share validation')
    assert.equal(nonGitCalls[1].options.input, input)
    assert.equal(git('rev-parse', 'HEAD'), newer)
    assert.deepEqual(readFileSync(join(repository, '.git/index')), indexBefore)
    assert.equal(readFileSync(join(repository, 'fixture.txt'), 'utf8'), 'uncommitted work')
    assert.equal(readFileSync(join(repository, 'untracked.txt'), 'utf8'), 'untracked work')
})

test('every tracked LFS hook reports the missing dependency before running another command', t => {
    const directory = directoryFixture(t)
    for (const hook of ['pre-push', 'post-checkout', 'post-commit', 'post-merge']) {
        const result = spawnSync('/bin/sh', [join(root, '.husky', hook), ...remoteArgs], {
            cwd: root,
            env: isolatedEnvironment({ PATH: directory }),
            encoding: 'utf8',
        })
        assert.equal(result.status, 2)
        assert.match(result.stderr, /Git LFS is required/)
        assert.doesNotMatch(result.stderr, /credential-sentinel/)
    }
})

test('tracked LFS lifecycle hooks forward arguments and propagate errors', t => {
    const directory = directoryFixture(t)
    const log = join(directory, 'args')
    writeFileSync(join(directory, 'git-lfs'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    writeFileSync(join(directory, 'git'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$HOOK_ARGUMENTS"\nexit "$HOOK_STATUS"\n', { mode: 0o755 })
    for (const hook of ['post-checkout', 'post-commit', 'post-merge']) {
        for (const status of [0, 19]) {
            const result = spawnSync('/bin/sh', [join(root, '.husky', hook), first, second, '1'], {
                cwd: root,
                env: isolatedEnvironment({ PATH: directory, HOOK_ARGUMENTS: log, HOOK_STATUS: String(status) }),
            })
            assert.equal(result.status, status)
            assert.equal(readFileSync(log, 'utf8'), `lfs\n${hook}\n${first}\n${second}\n1\n`)
        }
    }
})

test('the tracked pre-push hook forwards stdin and remote arguments to the coordinator', t => {
    const directory = directoryFixture(t)
    const log = join(directory, 'args')
    const inputLog = join(directory, 'input')
    writeFileSync(join(directory, 'git-lfs'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    writeFileSync(join(directory, 'node'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$HOOK_ARGUMENTS"\n/bin/cat > "$HOOK_INPUT"\nexit "$HOOK_STATUS"\n', { mode: 0o755 })
    const input = Buffer.from(update())
    for (const status of [0, 31]) {
        const result = spawnSync('/bin/sh', [join(root, '.husky/pre-push'), ...remoteArgs], {
            cwd: root,
            input,
            env: isolatedEnvironment({ PATH: directory, HOOK_ARGUMENTS: log, HOOK_INPUT: inputLog, HOOK_STATUS: String(status) }),
        })
        assert.equal(result.status, status)
        assert.equal(readFileSync(log, 'utf8'), `scripts/ci/pre-push.mjs\n${remoteArgs.join('\n')}\n`)
        assert.deepEqual(readFileSync(inputLog), input)
    }
})
