import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { resolveComparisonBase } from './comparison-base.mjs'

const toolingRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shaPattern = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i

export function parseArguments(args) {
    const options = { commit: 'HEAD' }
    const seen = new Set()
    for (let i = 0; i < args.length; i++) {
        if (seen.has(args[i])) throw new Error('Each local validation option may be supplied only once.')
        seen.add(args[i])
        if (args[i] === '--all') {
            options.all = true
            continue
        }
        const key = { '--commit': 'commit', '--base': 'base', '--remote': 'remote' }[args[i]]
        if (!key || !args[i + 1] || (key === 'base' && !shaPattern.test(args[i + 1]))) {
            throw new Error('Usage: pnpm ci:local [--commit <revision>] [--base <commit SHA> | --all] [--remote <name>]')
        }
        if (args[i + 1].startsWith('-') || /[\r\n\0]/.test(args[i + 1])) {
            throw new Error('Invalid local validation option value')
        }
        options[key] = args[++i]
    }
    if (options.all && options.base !== undefined) throw new Error('--all and --base cannot be used together.')
    return options
}

export function cleanGitEnvironment(environment = process.env) {
    return Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith('GIT_')))
}

export function assertLocalDockerEndpoint(endpoint) {
    if (!endpoint.startsWith('unix://')) {
        throw new Error('Local validation requires a local Docker Unix socket; select your local Docker context.')
    }
}

export function containerArguments(name, image, commit, base, all = false) {
    return [
        'create', '--name', name, '--privileged', '--init', '--shm-size=1g',
        '--label', 'com.tuposoft.lef.local-validation=true',
        '--env', `LEF_VALIDATION_COMMIT=${commit}`,
        ...(base ? ['--env', `LEF_VALIDATION_BASE=${base}`] : []),
        ...(all ? ['--env', 'LEF_VALIDATION_ALL=1'] : []),
        image,
    ]
}

export function execute(command, args, { cwd, env, capture = false, signal, timeoutMs, trimOutput = true } = {}) {
    return new Promise((accept, reject) => {
        const child = spawn(command, args, {
            cwd, env, signal, timeout: timeoutMs, stdio: ['ignore', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'],
        })
        let stdout = ''
        let stderr = ''
        let spawnError
        child.stdout?.on('data', chunk => { stdout += chunk })
        child.stderr?.on('data', chunk => { stderr += chunk })
        // An aborted child emits error before close. Wait for close before cleanup.
        child.on('error', error => { spawnError = error })
        child.on('close', (code, killedBy) => {
            if (spawnError) reject(spawnError)
            else if (code === 0) accept(trimOutput ? stdout.trim() : stdout)
            else reject(new Error(`${command} failed (${killedBy ?? code})${capture ? `: ${stderr.trim()}` : ''}`))
        })
    })
}

/** Clone Git objects, never a developer's untracked files, secrets, or build output. */
export async function prepareSnapshot(repository, destination, commit, base, run = execute) {
    const env = { ...cleanGitEnvironment(), HUSKY: '0', GIT_LFS_SKIP_SMUDGE: '1' }
    const git = (args, cwd = destination) => run('git', args, { cwd, env, capture: true })
    await git(['clone', '--quiet', '--no-local', '--no-checkout', '--', repository, destination], repository)
    for (const revision of [commit, base].filter(Boolean)) {
        try { await git(['cat-file', '-e', `${revision}^{commit}`]) } catch {
            await git(['fetch', '--quiet', '--no-tags', '--', repository, revision])
        }
    }
    await git(['-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', commit])
    await git(['config', '--local', 'core.hooksPath', '/dev/null'])
    // Keep remote-tracking refs as baseline evidence, but remove the source checkout path.
    await git(['config', '--local', '--unset', 'remote.origin.url'])

    const listing = JSON.parse(await git(['lfs', 'ls-files', '--json']))
    if (listing.files?.length > 0) {
        const sourceEnvironment = await git(['lfs', 'env'], repository)
        const mediaDirectory = /^LocalMediaDir=(.+)$/m.exec(sourceEnvironment)?.[1]
        if (!mediaDirectory) throw new Error('Cannot locate the local Git LFS object cache')
        for (const file of listing.files) {
            if (file.oid_type !== 'sha256' || !/^[a-f\d]{64}$/.test(file.oid)) throw new Error('Unsupported Git LFS object')
            const path = resolve(destination, file.name)
            const parent = await realpath(dirname(path))
            if (!path.startsWith(`${destination}${sep}`) || (parent !== destination && !parent.startsWith(`${destination}${sep}`))
                || !(await lstat(path)).isFile()) throw new Error('Unsafe Git LFS checkout path')
            const objectPath = join(mediaDirectory, file.oid.slice(0, 2), file.oid.slice(2, 4), file.oid)
            let data
            try { data = await readFile(objectPath) } catch {
                throw new Error(`Git LFS object for ${file.name} is missing. Run git lfs pull for the pushed revision, then retry.`)
            }
            if (createHash('sha256').update(data).digest('hex') !== file.oid) throw new Error(`Git LFS hash mismatch: ${file.name}`)
            const snapshotObject = join(destination, '.git/lfs/objects', file.oid.slice(0, 2), file.oid.slice(2, 4), file.oid)
            await mkdir(dirname(snapshotObject), { recursive: true })
            await writeFile(snapshotObject, data)
            await writeFile(path, data)
        }
    }
}

export async function validateLocally(options = {}, {
    run = execute, repository = process.cwd(), signal, environment = process.env, resolveBase = resolveComparisonBase,
} = {}) {
    const env = cleanGitEnvironment(environment)
    const git = (args, extra = {}) => run('git', args, { cwd: repository, env, capture: true, signal, ...extra })
    repository = await git(['rev-parse', '--show-toplevel'])
    const commit = await git(['rev-parse', '--verify', '--end-of-options', `${options.commit ?? 'HEAD'}^{commit}`])
    if (!shaPattern.test(commit)) throw new Error('Cannot resolve the commit to validate')
    const base = resolveBase({ commit, base: options.base, remote: options.remote, all: options.all }, { repository, environment: env })
    if (base) {
        const changed = await git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', base, commit, '--'], { trimOutput: false })
        if (changed === '') {
            console.log(`No committed files changed between ${base} and ${commit}; local validation has no checks to run.`)
            return
        }
        if (!changed.endsWith('\0')) throw new Error('Git did not return a complete changed-file list; local validation cannot continue.')
    }
    const docker = (args, extra = {}) => run('docker', args, { cwd: repository, env, signal, ...extra })
    const endpoint = env.DOCKER_CONTEXT
        ? await docker(['context', 'inspect', env.DOCKER_CONTEXT, '--format', '{{.Endpoints.docker.Host}}'], { capture: true })
        : env.DOCKER_HOST || await docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { capture: true })
    assertLocalDockerEndpoint(endpoint)
    if (await docker(['info', '--format', '{{.OSType}}'], { capture: true }) !== 'linux') {
        throw new Error('Local validation requires Docker running Linux containers')
    }
    const temporary = await mkdtemp(join(tmpdir(), 'lef-local-ci-'))
    const name = `lef-local-ci-${randomUUID()}`
    let createAttempted = false
    let failure
    try {
        console.log(`Preparing isolated validation for ${commit}${base ? ` against ${base}` : ' (all consumers)'}.`)
        const snapshot = join(temporary, 'checkout')
        await prepareSnapshot(repository, snapshot, commit, base, (command, args, extra) => run(command, args, { ...extra, signal }))
        const context = join(temporary, 'runner')
        await cp(join(toolingRoot, 'docker/ci-local'), context, { recursive: true })
        const runtimeScripts = ['run-local-checks.mjs', 'select-validation.mjs', 'incremental-checks.mjs']
        for (const script of runtimeScripts) {
            await copyFile(join(toolingRoot, 'scripts/ci', script), join(context, script))
        }
        const hash = createHash('sha256')
        for (const file of ['Dockerfile', 'entrypoint.sh', ...runtimeScripts]) hash.update(await readFile(join(context, file)))
        const image = `lef-local-validation:${hash.digest('hex').slice(0, 16)}`
        await docker(['build', '--tag', image, context])
        createAttempted = true
        await docker(containerArguments(name, image, commit, base, options.all), { capture: true })
        await docker(['cp', `${snapshot}/.`, `${name}:/workspace`])
        // Attaching returns the validation entrypoint's exit status; there is no success cache.
        await docker(['start', '--attach', name])
        const status = await docker(['inspect', '--format', '{{.State.ExitCode}}', name], { capture: true })
        if (status !== '0') throw new Error(`Local validation failed with container exit code ${status}`)
        console.log(`Local validation passed for ${commit}.`)
    } catch (error) {
        failure = error
    } finally {
        if (createAttempted) {
            try { await docker(['rm', '--force', '--volumes', name], { signal: undefined, capture: true, timeoutMs: 60_000 }) } catch (error) {
                if (!/No such container/i.test(error.message)) {
                    console.error(`Could not remove validation container ${name}; run docker rm -fv ${name}.`)
                    failure ??= error
                }
            }
        }
        await rm(temporary, { recursive: true, force: true })
    }
    if (failure) throw failure
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const controller = new AbortController()
    const interrupt = () => controller.abort()
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    try {
        await validateLocally(parseArguments(process.argv.slice(2)), { signal: controller.signal })
    } catch (error) {
        console.error(`Local validation: ${error.message}`)
        process.exitCode = 1
    } finally {
        process.removeListener('SIGINT', interrupt)
        process.removeListener('SIGTERM', interrupt)
    }
}
