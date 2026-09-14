import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const objectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i
const zeroId = /^0+$/

export function parsePushUpdates(input) {
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input
    if (typeof text !== 'string') throw new Error('Expected Git ref updates on standard input.')
    if (text === '') return []
    const lines = text.split('\n')
    if (lines.at(-1) === '') lines.pop()
    return lines.map((line, index) => {
        const fields = line.split(' ')
        const [localRef, localSha, remoteRef, remoteSha] = fields
        if (fields.length !== 4
            || !localRef || !remoteRef
            || /\s/.test(localRef + remoteRef)
            || [...localRef + remoteRef].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
            || !objectId.test(localSha) || !objectId.test(remoteSha)
            || localSha.length !== remoteSha.length
            || (zeroId.test(localSha) && zeroId.test(remoteSha))) {
            throw new Error(`Malformed Git ref update on line ${index + 1}.`)
        }
        return { localRef, localSha, remoteRef, remoteSha }
    })
}

function exitStatus(result) {
    return Number.isInteger(result?.status) && result.status >= 0 ? result.status : 1
}

export function runPrePush({
    input,
    remoteArgs,
    repository = process.cwd(),
    invoke = spawnSync,
    stderr = process.stderr,
}) {
    if (!Array.isArray(remoteArgs) || remoteArgs.length !== 2
        || remoteArgs.some(argument => typeof argument !== 'string' || argument === '' || argument.includes('\0'))) {
        stderr.write('Expected the Git remote name and location.\n')
        return 1
    }
    let updates
    try {
        updates = parsePushUpdates(input)
    } catch (error) {
        stderr.write(`${error.message}\n`)
        return 1
    }
    const resolveCommit = revision => {
        const result = invoke('git', ['rev-parse', '--verify', `${revision}^{commit}`], {
            cwd: repository,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        const commit = result.stdout?.toString().trim()
        return exitStatus(result) === 0 && objectId.test(commit) && !zeroId.test(commit) ? commit : undefined
    }
    const comparisons = new Map()
    for (const update of updates) {
        if (zeroId.test(update.localSha)) continue
        const commit = resolveCommit(update.localSha)
        if (!commit) {
            stderr.write('A pushed object does not resolve to an available commit; validation cannot run.\n')
            return 1
        }
        const base = zeroId.test(update.remoteSha) ? undefined : resolveCommit(update.remoteSha)
        comparisons.set(`${commit}:${base ?? ''}`, { commit, base })
    }
    for (const { commit, base } of comparisons.values()) {
        const args = [resolve(repository, 'scripts/ci/local-validation.mjs'), '--commit', commit]
        if (base) args.push('--base', base)
        const result = invoke(process.execPath, args, {
            cwd: repository,
            stdio: ['ignore', 'inherit', 'inherit'],
        })
        if (exitStatus(result) !== 0) {
            stderr.write('Local validation failed; the push was stopped.\n')
            return exitStatus(result)
        }
    }
    const result = invoke('git', ['lfs', 'pre-push', ...remoteArgs], {
        cwd: repository,
        input,
        stdio: ['pipe', 'inherit', 'inherit'],
    })
    if (exitStatus(result) !== 0) stderr.write('Git LFS failed; the push was stopped.\n')
    return exitStatus(result)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        process.exitCode = runPrePush({ input: readFileSync(0), remoteArgs: process.argv.slice(2) })
    } catch {
        process.stderr.write('The pre-push hook could not complete; the push was stopped.\n')
        process.exitCode = 1
    }
}
