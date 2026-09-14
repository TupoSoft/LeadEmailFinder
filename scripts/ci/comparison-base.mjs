import { spawnSync } from 'node:child_process'

const commitId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i

function isCommitId(value) {
    return typeof value === 'string' && commitId.test(value) && !/^0+$/.test(value)
}

/** Resolve only local Git evidence; fetching or changing remote refs is a separate user action. */
export function resolveComparisonBase({ commit, base, remote = 'origin', all = false }, {
    repository = process.cwd(),
    invoke = spawnSync,
    environment = process.env,
} = {}) {
    if (!isCommitId(commit)) throw new Error('The validation commit must be a complete commit SHA.')
    if (all && base !== undefined) throw new Error('--all and --base cannot be used together.')
    if (all) return undefined

    const env = Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith('GIT_')))
    const git = args => {
        try {
            const result = invoke('git', args, {
                cwd: repository, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
            })
            return result?.status === 0 ? result.stdout?.toString().trim() : undefined
        } catch {
            return undefined
        }
    }
    const peel = revision => {
        const resolved = git(['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`])
        return isCommitId(resolved) ? resolved : undefined
    }

    if (base !== undefined) {
        if (!isCommitId(base)) throw new Error('The comparison base must be a complete nonzero commit SHA.')
        const resolved = peel(base)
        if (!resolved) {
            throw new Error('The comparison commit is unavailable locally. Fetch the relevant remote history and retry. Use --all only to request full validation explicitly.')
        }
        return resolved
    }

    const remotes = git(['remote'])?.split('\n') ?? []
    if (typeof remote !== 'string' || !remote || !remotes.includes(remote)) {
        throw new Error('Changed-file validation needs a configured remote. Push through a named remote, or select one with --remote for manual validation.')
    }
    const prefix = `refs/remotes/${remote}/`
    const defaultRef = git(['symbolic-ref', '--quiet', `${prefix}HEAD`])
    const defaultCommit = defaultRef?.startsWith(prefix) && !/[\r\n\0]/.test(defaultRef) ? peel(defaultRef) : undefined
    if (!defaultCommit) {
        throw new Error('The remote default tracking branch is unavailable. Run git fetch <remote> and git remote set-head <remote> -a, then retry; manual validation also accepts --base or explicit --all.')
    }
    const baseOutput = git(['merge-base', '--all', defaultCommit, commit])
    const bases = baseOutput?.split('\n') ?? []
    if (bases.length !== 1 || !isCommitId(bases[0])) {
        throw new Error('Cannot find a unique merge base with the remote default branch. Fetch enough history or supply --base for manual validation; --all explicitly requests full validation.')
    }
    return bases[0]
}
