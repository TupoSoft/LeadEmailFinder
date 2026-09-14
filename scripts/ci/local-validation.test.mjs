import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
    assertLocalDockerEndpoint, cleanGitEnvironment, containerArguments, execute,
    parseArguments, prepareSnapshot, validateLocally,
} from './local-validation.mjs'

const directories = []
const environment = { ...cleanGitEnvironment(), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', HUSKY: '0' }
function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'lef-local-ci-test-'))
    directories.push(root)
    const source = join(root, 'source')
    await mkdir(source)
    git(source, 'init', '--initial-branch=master')
    git(source, 'config', 'user.name', 'Hook test')
    git(source, 'config', 'user.email', 'hook@example.invalid')
    await writeFile(join(source, 'tracked.txt'), 'first commit\n')
    git(source, 'add', '.')
    git(source, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-m', 'first')
    const base = git(source, 'rev-parse', 'HEAD')
    await writeFile(join(source, 'tracked.txt'), 'pushed commit\n')
    git(source, 'add', '.')
    git(source, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-m', 'second')
    const commit = git(source, 'rev-parse', 'HEAD')
    git(source, 'remote', 'add', 'origin', source)
    git(source, 'update-ref', 'refs/remotes/origin/master', base)
    git(source, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/master')
    return { root, source, base, commit }
}
after(async () => {
    await Promise.all(directories.map(directory => rm(directory, { recursive: true, force: true })))
})

test('CLI rejects unknown options and option injection', () => {
    assert.deepEqual(parseArguments([]), { commit: 'HEAD' })
    assert.deepEqual(parseArguments(['--commit', 'main~2', '--base', 'a'.repeat(40)]), { commit: 'main~2', base: 'a'.repeat(40) })
    assert.deepEqual(parseArguments(['--all', '--commit', 'main']), { commit: 'main', all: true })
    assert.deepEqual(parseArguments(['--remote', 'upstream']), { commit: 'HEAD', remote: 'upstream' })
    for (const args of [['--commit'], ['--commit', '--help'], ['--base', 'HEAD'], ['--base', 'bad\ninput'],
        ['--all', '--base', 'a'.repeat(40)], ['--remote'], ['--all', '--all'], ['--base', 'a'.repeat(40), '--base', 'b'.repeat(40)]]) {
        assert.throws(() => parseArguments(args))
    }
})

test('foreign repository commands do not inherit Git repository or index pointers', () => {
    assert.deepEqual(cleanGitEnvironment({ GIT_DIR: '/source/.git', GIT_INDEX_FILE: '/source/index', PATH: '/bin' }), { PATH: '/bin' })
})

test('command startup errors and cancellations fail instead of approving validation', async () => {
    await assert.rejects(execute('/no/such/lef-command', [], { capture: true }), { code: 'ENOENT' })
    const controller = new AbortController()
    const running = execute(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal })
    controller.abort()
    await assert.rejects(running, { name: 'AbortError' })
})

test('isolated container has no host sockets, mounts, ports, or shared Docker data', () => {
    assert.doesNotThrow(() => assertLocalDockerEndpoint('unix:///run/user/1000/docker.sock'))
    for (const endpoint of ['ssh://manager-1', 'tcp://remote:2375', '']) assert.throws(() => assertLocalDockerEndpoint(endpoint))
    const args = containerArguments('owned-run', 'runner:version', 'a'.repeat(40), 'b'.repeat(40))
    assert.ok(args.includes('--privileged'))
    assert.ok(args.includes('LEF_VALIDATION_COMMIT=' + 'a'.repeat(40)))
    assert.ok(args.includes('LEF_VALIDATION_BASE=' + 'b'.repeat(40)))
    assert.ok(!args.includes('LEF_VALIDATION_ALL=1'))
    const full = containerArguments('owned-run', 'runner:version', 'a'.repeat(40), undefined, true)
    assert.ok(full.includes('LEF_VALIDATION_ALL=1'))
    assert.ok(!full.some(argument => argument.startsWith('LEF_VALIDATION_BASE=')))
    for (const forbidden of ['--mount', '--volume', '-v', '--publish', '-p', '--network', '--pid', '--volumes-from']) {
        assert.ok(!args.includes(forbidden))
    }
})

test('snapshot validates a non-HEAD committed revision and leaves dirty source files untouched', async () => {
    const { root, source, base, commit } = await fixture()
    await writeFile(join(source, 'tracked.txt'), 'uncommitted fix\n')
    await writeFile(join(source, '.env'), 'local secret\n')
    const snapshot = join(root, 'snapshot')
    await prepareSnapshot(source, snapshot, base)
    assert.equal(await readFile(join(snapshot, 'tracked.txt'), 'utf8'), 'first commit\n')
    assert.equal(git(snapshot, 'rev-parse', 'HEAD'), base)
    assert.equal(git(source, 'rev-parse', 'HEAD'), commit)
    assert.equal(await readFile(join(source, 'tracked.txt'), 'utf8'), 'uncommitted fix\n')
    assert.ok(!(await readdir(snapshot)).includes('.env'))
    assert.throws(() => git(snapshot, 'config', '--get', 'remote.origin.url'))
})

test('snapshot hydrates and verifies committed LFS data from the source cache', async () => {
    const { root, source, base } = await fixture()
    git(source, 'lfs', 'install', '--local', '--skip-repo')
    await writeFile(join(source, '.gitattributes'), '*.bin filter=lfs diff=lfs merge=lfs -text\n')
    await mkdir(join(source, 'data'))
    await writeFile(join(source, 'data/fixture.bin'), 'fixture content\n')
    git(source, 'add', '.')
    git(source, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-m', 'lfs')
    const commit = git(source, 'rev-parse', 'HEAD')
    const snapshot = join(root, 'snapshot')
    await prepareSnapshot(source, snapshot, commit, base)
    assert.equal(await readFile(join(snapshot, 'data/fixture.bin'), 'utf8'), 'fixture content\n')
    const { files } = JSON.parse(git(source, 'lfs', 'ls-files', '--json'))
    const oid = files[0].oid
    await writeFile(join(source, '.git/lfs/objects', oid.slice(0, 2), oid.slice(2, 4), oid), 'corrupted')
    await assert.rejects(prepareSnapshot(source, join(root, 'corrupt-snapshot'), commit), /hash mismatch/)
})

test('failed container validation removes only its owned container and temporary snapshot', async () => {
    const { source, commit, base } = await fixture()
    const calls = []
    let snapshot
    let name
    const run = async (command, args, options) => {
        if (command !== 'docker') return execute(command, args, options)
        calls.push(args)
        if (args[0] === 'context') return 'unix:///local/docker.sock'
        if (args[0] === 'info') return 'linux'
        if (args[0] === 'create') { name = args[args.indexOf('--name') + 1]; return 'id' }
        if (args[0] === 'cp') {
            snapshot = args[1].slice(0, -2)
            assert.equal(git(snapshot, 'rev-parse', 'HEAD'), commit)
        }
        if (args[0] === 'start') throw new Error('A selected check failed')
        return ''
    }
    await assert.rejects(validateLocally({ commit, base }, { repository: source, run }), /selected check failed/)
    assert.deepEqual(calls.at(-1), ['rm', '--force', '--volumes', name])
    await assert.rejects(readFile(join(snapshot, 'tracked.txt')), { code: 'ENOENT' })
    assert.ok(calls.every(args => !args.includes('prune')))
})

test('a remote Docker context fails before snapshot creation or image build', async () => {
    const { source, commit } = await fixture()
    const calls = []
    const run = (command, args, options) => {
        if (command !== 'docker') return execute(command, args, options)
        calls.push(args)
        return Promise.resolve('ssh://manager-1')
    }
    await assert.rejects(validateLocally({ commit }, { repository: source, run, environment: {} }), /local Docker Unix socket/)
    assert.equal(calls.length, 1)
})

test('missing comparison history fails before any Docker call instead of selecting all checks', async () => {
    const { source, commit } = await fixture()
    const calls = []
    const run = (command, args, options) => {
        calls.push({ command, args })
        return execute(command, args, options)
    }
    await assert.rejects(validateLocally({ commit, base: 'f'.repeat(40) }, { repository: source, run }), /comparison commit is unavailable/)
    assert.ok(calls.every(call => call.command === 'git'))
})

test('manual validation resolves the remote default merge base before Docker starts', async () => {
    const { source, commit, base } = await fixture()
    let resolved
    const run = (command, args, options) => {
        if (command !== 'docker') return execute(command, args, options)
        throw new Error('Stop before Docker starts')
    }
    const { resolveComparisonBase } = await import('./comparison-base.mjs')
    await assert.rejects(validateLocally({ commit }, {
        repository: source,
        run,
        resolveBase: (options, context) => { resolved = resolveComparisonBase(options, context); return resolved },
    }), /Stop before Docker starts/)
    assert.equal(resolved, base)
})

test('verified empty tree comparisons skip Docker even for distinct commits', async () => {
    const { source, commit } = await fixture()
    git(source, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Same tree')
    const sameTreeCommit = git(source, 'rev-parse', 'HEAD')
    for (const target of [commit, sameTreeCommit]) {
        const calls = []
        await validateLocally({ commit: target, base: commit }, {
            repository: source,
            run: (command, args, options) => {
                calls.push({ command, args })
                assert.notEqual(command, 'docker', 'An empty comparison needs no Docker prerequisites')
                return execute(command, args, options)
            },
        })
        assert(calls.some(call => call.args[0] === 'diff' && call.args.includes('-z')))
    }
})

test('an incomplete changed-file response cannot silently skip validation', async () => {
    const { source, commit, base } = await fixture()
    await assert.rejects(validateLocally({ commit, base }, {
        repository: source,
        run: (command, args, options) => {
            assert.notEqual(command, 'docker')
            if (args[0] === 'diff') return Promise.resolve('partial-file-name')
            return execute(command, args, options)
        },
    }), /complete changed-file list/)
})

test('explicit all mode reaches the owned container without comparison history', async () => {
    const { source, commit } = await fixture()
    git(source, 'remote', 'remove', 'origin')
    let created
    const run = (command, args, options) => {
        if (command !== 'docker') return execute(command, args, options)
        if (args[0] === 'context') return Promise.resolve('unix:///local/docker.sock')
        if (args[0] === 'info') return Promise.resolve('linux')
        if (args[0] === 'create') { created = args; return Promise.reject(new Error('Stop at create')) }
        return Promise.resolve('')
    }
    await assert.rejects(validateLocally({ commit, all: true }, { repository: source, run }), /Stop at create/)
    assert.ok(created.includes('LEF_VALIDATION_ALL=1'))
    assert.ok(!created.some(argument => argument.startsWith('LEF_VALIDATION_BASE=')))
})

test('an interrupted create still cleans up the container whose creation was attempted', async () => {
    const { source, commit } = await fixture()
    const calls = []
    let name
    const run = (command, args, options) => {
        if (command !== 'docker') return execute(command, args, options)
        calls.push(args)
        if (args[0] === 'context') return Promise.resolve('unix:///local/docker.sock')
        if (args[0] === 'info') return Promise.resolve('linux')
        if (args[0] === 'create') {
            name = args[args.indexOf('--name') + 1]
            return Promise.reject(new Error('Interrupted after server created the container'))
        }
        return Promise.resolve('')
    }
    await assert.rejects(validateLocally({ commit }, { repository: source, run }), /Interrupted after server created/)
    assert.deepEqual(calls.at(-1), ['rm', '--force', '--volumes', name])
    assert.ok(!calls.some(args => args[0] === 'start'))
})
