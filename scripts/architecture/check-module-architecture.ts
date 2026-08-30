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

const ADOPTION_RECONCILIATION_EXACT_PATHS = new Set([
    BASELINE_RELATIVE_PATH,
    'scripts/architecture/check-module-architecture.ts',
    'scripts/architecture/module-architecture.spec.ts',
])
const ADOPTION_RECONCILIATION_PLAN_PREFIX = '.agents/plans/module-architecture-reconciliation/'
const SCANNER_RELEVANT_UNTRACKED_PATHS = [
    'src',
    'scripts',
    'jest.config.ts',
    ':(top,glob)tsconfig*.json',
    'package.json',
    'pnpm-lock.yaml',
] as const

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

interface BaseComparison {
    readonly matches: boolean
    readonly reconciliationEligible: boolean
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

function baselineExistsAtRevision(rootDir: string, revision: string): boolean {
    const treeContents = requireGitSuccess(
        runGit(rootDir, ['ls-tree', '--name-only', revision, '--', BASELINE_RELATIVE_PATH]),
        `Failed to inspect architecture baseline at revision ${revision}`,
    )
    return treeContents.trim().split(/\r?\n/).includes(BASELINE_RELATIVE_PATH)
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

    if (baselineExistsAtRevision(rootDir, baseSha)) {
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

function parseNullDelimitedPaths(output: string): readonly string[] {
    return output.split('\0').filter(path => path !== '')
}

function isAdoptionReconciliationPath(path: string): boolean {
    return ADOPTION_RECONCILIATION_EXACT_PATHS.has(path) || path.startsWith(ADOPTION_RECONCILIATION_PLAN_PREFIX)
}

function collectChangedPaths(rootDir: string, baseSha: string): ReadonlySet<string> {
    const tracked = requireGitSuccess(
        runGit(rootDir, ['diff', '--name-only', '--no-renames', '-z', baseSha, '--']),
        `Failed to compare architecture reconciliation paths with base commit ${baseSha}`,
    )
    const untracked = requireGitSuccess(
        runGit(rootDir, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.']),
        `Failed to inspect untracked files during architecture adoption reconciliation at ${baseSha}`,
    )
    const ignoredScannerInputs = requireGitSuccess(
        runGit(rootDir, ['ls-files', '--others', '-z', '--', ...SCANNER_RELEVANT_UNTRACKED_PATHS]),
        `Failed to inspect ignored scanner inputs during architecture adoption reconciliation at ${baseSha}`,
    )

    return new Set([
        ...parseNullDelimitedPaths(tracked),
        ...parseNullDelimitedPaths(untracked),
        ...parseNullDelimitedPaths(ignoredScannerInputs),
    ])
}

function adoptionReconciliationEligible(
    rootDir: string,
    baseSha: string,
    addedViolations: readonly ArchitectureViolation[],
): boolean {
    if (!baselineExistsAtRevision(rootDir, baseSha)) {
        return false
    }

    const ancestorCheck = runGit(rootDir, ['merge-base', '--is-ancestor', baseSha, 'HEAD'])
    if (ancestorCheck.error === undefined && ancestorCheck.status === 1) {
        return false
    }
    requireGitSuccess(ancestorCheck, `Failed to verify architecture base commit ${baseSha} against HEAD`)

    const ancestry = requireGitSuccess(
        runGit(rootDir, ['rev-list', '--parents', '-n', '1', baseSha]),
        `Failed to inspect parents of architecture base commit ${baseSha}`,
    )
        .trim()
        .split(/\s+/)
    if (ancestry.length < 2) {
        throw new Error(`Architecture base commit ${baseSha} has no first parent; reconciliation is unsafe.`)
    }
    if (ancestry.length !== 2) {
        return false
    }
    const firstParent = ancestry[1]
    const priorBaselineRevision = requireGitSuccess(
        runGit(rootDir, ['log', '-n', '1', '--format=%H', firstParent, '--', BASELINE_RELATIVE_PATH]),
        `Failed to inspect architecture baseline ancestry before base commit ${baseSha}`,
    ).trim()
    if (priorBaselineRevision !== '') {
        return false
    }

    const changedPaths = collectChangedPaths(rootDir, baseSha)
    if ([...changedPaths].some(path => !isAdoptionReconciliationPath(path))) {
        return false
    }

    return addedViolations.every(violation => violation.source !== undefined && !changedPaths.has(violation.source))
}

function compareWithBase(
    rootDir: string,
    environment: NodeJS.ProcessEnv,
    stderr: TextWriter,
    currentBaselineKeys: readonly string[],
    currentViolations: readonly ArchitectureViolation[],
): BaseComparison {
    const baseBaseline = readBaseBaseline(rootDir, environment, stderr)
    if (baseBaseline === undefined) {
        return { matches: true, reconciliationEligible: false }
    }
    if (baseBaseline === null) {
        stderr.write('Base revision predates the architecture baseline; allowing bootstrap.\n')
        return { matches: true, reconciliationEligible: false }
    }

    const baseKeys = new Set(baseBaseline)
    const addedKeys = currentBaselineKeys.filter(key => !baseKeys.has(key))
    if (addedKeys.length === 0) {
        return { matches: true, reconciliationEligible: false }
    }

    const currentKeys = new Set(currentBaselineKeys)
    const hasRemovedBaseKeys = baseBaseline.some(key => !currentKeys.has(key))
    const violationsByKey = new Map(currentViolations.map(violation => [violation.key, violation]))
    const addedViolations = addedKeys
        .map(key => violationsByKey.get(key))
        .filter((violation): violation is ArchitectureViolation => violation !== undefined)
    const baseSha = environment.ARCHITECTURE_BASE_SHA!.trim()
    const reconciliationEligible =
        !hasRemovedBaseKeys &&
        addedViolations.length === addedKeys.length &&
        adoptionReconciliationEligible(rootDir, baseSha, addedViolations)
    if (!reconciliationEligible) {
        printBaseGrowth(stderr, addedKeys)
    }
    return { matches: false, reconciliationEligible }
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

    const baseComparison = compareWithBase(rootDir, environment, stderr, baseline.violations, scan.violations)
    if (!comparison.matches || (!baseComparison.matches && !baseComparison.reconciliationEligible)) {
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

    const baseComparison = compareWithBase(rootDir, environment, stderr, currentKeys, scan.violations)
    if (!baseComparison.matches && !baseComparison.reconciliationEligible) {
        return 1
    }

    if (!existsSync(baselinePath)) {
        if (baseComparison.reconciliationEligible) {
            stderr.write('Adoption reconciliation requires the current architecture baseline file to exist.\n')
            return 1
        }
        writeBaselineAtomically(baselinePath, currentKeys)
        stdout.write(`Created architecture baseline with ${currentKeys.length} violations.\n`)
        return 0
    }

    const baseline = parseBaseline(readFileSync(baselinePath, 'utf8'), BASELINE_RELATIVE_PATH)
    const comparison = compareViolationSets(scan.violations, baseline.violations)
    if (comparison.currentOnly.length > 0) {
        if (baseComparison.reconciliationEligible && comparison.baselineOnly.length === 0) {
            writeBaselineAtomically(baselinePath, currentKeys)
            stdout.write(
                `Reconciled architecture baseline adoption from ${baseline.violations.length} to ${currentKeys.length} violations.\n`,
            )
            return 0
        }

        printNewViolations(stderr, comparison.currentOnly)
        printStaleEntries(stderr, comparison.baselineOnly)
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
