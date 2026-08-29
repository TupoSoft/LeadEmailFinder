import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
    compareViolationSets,
    parseBaseline,
    scanModuleArchitecture,
    serializeBaseline,
    type ArchitectureViolation,
} from './module-architecture'

export const BASELINE_RELATIVE_PATH = 'scripts/architecture/module-architecture-baseline.json'

interface TextWriter {
    write(text: string): unknown
}

interface ArchitectureCliOptions {
    args?: readonly string[]
    env?: NodeJS.ProcessEnv
    rootDir?: string
    stderr?: TextWriter
    stdout?: TextWriter
}

interface GitResult {
    error?: Error
    status: number | null
    stderr: string
    stdout: string
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function runGit(rootDir: string, args: readonly string[]): GitResult {
    const result = spawnSync('git', args, {
        cwd: rootDir,
        encoding: 'utf8',
        shell: false,
    })

    return {
        error: result.error,
        status: result.status,
        stderr: result.stderr ?? '',
        stdout: result.stdout ?? '',
    }
}

function requireGitSuccess(result: GitResult, operation: string): string {
    if (result.error === undefined && result.status === 0) {
        return result.stdout
    }

    const detail = result.error?.message ?? (result.stderr.trim() || `git exited with status ${result.status}`)
    throw new Error(`${operation}: ${detail}`)
}

function showBaseline(rootDir: string, revision: string): readonly string[] {
    const result = runGit(rootDir, ['show', `${revision}:${BASELINE_RELATIVE_PATH}`])
    const contents = requireGitSuccess(result, `Failed to read architecture baseline at revision ${revision}`)
    return parseBaseline(contents, `${revision}:${BASELINE_RELATIVE_PATH}`).violations
}

/**
 * Reads the baseline at a usable pull-request base. `undefined` means that no
 * cross-revision comparison can be made; `null` is the one-time bootstrap case
 * where the commit exists but predates the baseline file.
 */
export function readBaseBaseline(
    rootDir: string,
    environment: NodeJS.ProcessEnv,
    stderr: TextWriter,
): readonly string[] | null | undefined {
    const baseSha = environment.ARCHITECTURE_BASE_SHA?.trim() ?? ''
    if (!/^[0-9a-f]{40}$/i.test(baseSha) || /^0{40}$/.test(baseSha)) {
        return undefined
    }

    const commitCheck = runGit(rootDir, ['cat-file', '-e', `${baseSha}^{commit}`])
    if (commitCheck.error !== undefined || commitCheck.status !== 0) {
        stderr.write(`Skipping cross-revision architecture comparison: base commit ${baseSha} is unavailable.\n`)
        return undefined
    }

    const treeContents = requireGitSuccess(
        runGit(rootDir, ['ls-tree', '--name-only', baseSha, '--', BASELINE_RELATIVE_PATH]),
        `Failed to inspect architecture baseline at base commit ${baseSha}`,
    )
    if (treeContents.trim().split(/\r?\n/).includes(BASELINE_RELATIVE_PATH)) {
        return showBaseline(rootDir, baseSha)
    }

    const priorRevision = requireGitSuccess(
        runGit(rootDir, ['log', '-n', '1', '--format=%H', '--diff-filter=AM', baseSha, '--', BASELINE_RELATIVE_PATH]),
        `Failed to inspect architecture baseline history at base commit ${baseSha}`,
    ).trim()

    return priorRevision === '' ? null : showBaseline(rootDir, priorRevision)
}

function printNewViolations(stderr: TextWriter, violations: readonly ArchitectureViolation[]): void {
    if (violations.length === 0) {
        return
    }

    stderr.write('New architecture violations:\n')
    const sorted = [...violations].sort(
        (left, right) => left.ruleId.localeCompare(right.ruleId) || left.key.localeCompare(right.key),
    )
    let previousRule = ''
    for (const violation of sorted) {
        if (violation.ruleId !== previousRule) {
            stderr.write(`  ${violation.ruleId}:\n`)
            previousRule = violation.ruleId
        }
        const location = violation.source
            ? `${violation.source}${violation.line === undefined ? '' : `:${violation.line}:${violation.column ?? 1}`}`
            : '<repository>'
        const target = violation.target ? ` -> ${violation.target}` : ''
        stderr.write(`    [NEW] ${location}${target}: ${violation.message}\n`)
        stderr.write(`      ${violation.key}\n`)
    }
}

function printStaleEntries(stderr: TextWriter, keys: readonly string[]): void {
    if (keys.length === 0) {
        return
    }

    stderr.write('Stale architecture baseline entries:\n')
    const groups = new Map<string, string[]>()
    for (const key of [...keys].sort()) {
        const separatorIndex = key.indexOf('|')
        const ruleId = separatorIndex > 0 ? key.slice(0, separatorIndex) : '<unknown-rule>'
        const group = groups.get(ruleId) ?? []
        group.push(key)
        groups.set(ruleId, group)
    }
    for (const [ruleId, entries] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
        stderr.write(`  ${ruleId}:\n`)
        for (const key of entries) {
            stderr.write(`    [STALE] ${key}\n`)
        }
    }
}

function printBaseGrowth(stderr: TextWriter, keys: readonly string[]): void {
    if (keys.length === 0) {
        return
    }

    stderr.write('Architecture baseline grew relative to the base revision:\n')
    for (const key of [...keys].sort()) {
        stderr.write(`  [BASELINE GROWTH] ${key}\n`)
    }
}

function compareWithBase(
    rootDir: string,
    environment: NodeJS.ProcessEnv,
    stderr: TextWriter,
    currentBaselineKeys: readonly string[],
): boolean {
    const baseBaseline = readBaseBaseline(rootDir, environment, stderr)
    if (baseBaseline === undefined) {
        return true
    }
    if (baseBaseline === null) {
        stderr.write('Base revision predates the architecture baseline; allowing bootstrap.\n')
        return true
    }

    const baseKeys = new Set(baseBaseline)
    const addedKeys = currentBaselineKeys.filter(key => !baseKeys.has(key))
    printBaseGrowth(stderr, addedKeys)
    return addedKeys.length === 0
}

function writeBaselineAtomically(path: string, keys: readonly string[]): void {
    const temporaryPath = `${path}.tmp`
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(temporaryPath, serializeBaseline(keys), 'utf8')
    renameSync(temporaryPath, path)
}

function checkArchitecture(
    rootDir: string,
    environment: NodeJS.ProcessEnv,
    stdout: TextWriter,
    stderr: TextWriter,
): number {
    const baselinePath = join(rootDir, BASELINE_RELATIVE_PATH)
    if (!existsSync(baselinePath)) {
        stderr.write(
            `Architecture baseline is missing at ${BASELINE_RELATIVE_PATH}; run architecture:baseline to bootstrap it.\n`,
        )
        return 1
    }

    const baseline = parseBaseline(readFileSync(baselinePath, 'utf8'), BASELINE_RELATIVE_PATH)
    const scan = scanModuleArchitecture({ rootDir })
    const comparison = compareViolationSets(scan.violations, baseline.violations)
    printNewViolations(stderr, comparison.currentOnly)
    printStaleEntries(stderr, comparison.baselineOnly)

    const baseMatches = compareWithBase(rootDir, environment, stderr, baseline.violations)
    if (!comparison.matches || !baseMatches) {
        return 1
    }

    stdout.write(
        `Module architecture check passed (${scan.modules.length} modules, ${scan.violations.length} baselined violations).\n`,
    )
    return 0
}

function updateBaseline(
    rootDir: string,
    environment: NodeJS.ProcessEnv,
    stdout: TextWriter,
    stderr: TextWriter,
): number {
    const baselinePath = join(rootDir, BASELINE_RELATIVE_PATH)
    const scan = scanModuleArchitecture({ rootDir })
    const currentKeys = scan.violations.map(violation => violation.key).sort()

    if (!compareWithBase(rootDir, environment, stderr, currentKeys)) {
        return 1
    }

    if (!existsSync(baselinePath)) {
        writeBaselineAtomically(baselinePath, currentKeys)
        stdout.write(`Created architecture baseline with ${currentKeys.length} violations.\n`)
        return 0
    }

    const baseline = parseBaseline(readFileSync(baselinePath, 'utf8'), BASELINE_RELATIVE_PATH)
    const comparison = compareViolationSets(scan.violations, baseline.violations)
    if (comparison.currentOnly.length > 0) {
        printNewViolations(stderr, comparison.currentOnly)
        stderr.write('Refusing to grow the architecture baseline. Fix the new violations instead.\n')
        return 1
    }

    if (comparison.baselineOnly.length === 0) {
        stdout.write(`Architecture baseline is already current (${currentKeys.length} violations).\n`)
        return 0
    }

    writeBaselineAtomically(baselinePath, currentKeys)
    stdout.write(
        `Shrank architecture baseline from ${baseline.violations.length} to ${currentKeys.length} violations.\n`,
    )
    return 0
}

export function runArchitectureCli(options: ArchitectureCliOptions = {}): number {
    const args = options.args ?? process.argv.slice(2)
    const environment = options.env ?? process.env
    const rootDir = options.rootDir ?? process.cwd()
    const stderr = options.stderr ?? process.stderr
    const stdout = options.stdout ?? process.stdout

    if (args.length > 1 || (args.length === 1 && args[0] !== '--write-baseline')) {
        stderr.write('Usage: architecture:check [--write-baseline]\n')
        return 1
    }

    try {
        return args[0] === '--write-baseline'
            ? updateBaseline(rootDir, environment, stdout, stderr)
            : checkArchitecture(rootDir, environment, stdout, stderr)
    } catch (error) {
        stderr.write(`Module architecture check failed: ${formatError(error)}\n`)
        return 1
    }
}

if (require.main === module) {
    process.exitCode = runArchitectureCli()
}
