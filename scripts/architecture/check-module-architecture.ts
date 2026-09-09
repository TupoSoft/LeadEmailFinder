import { scanModuleArchitecture, type ArchitectureViolation } from './module-architecture'

interface TextWriter {
    write(text: string): unknown
}

interface ArchitectureCliOptions {
    args?: readonly string[]
    rootDir?: string
    stderr?: TextWriter
    stdout?: TextWriter
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

function printViolations(stderr: TextWriter, violations: readonly ArchitectureViolation[]): void {
    stderr.write('Module architecture violations:\n')
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
        stderr.write(`    ${location}${target}: ${violation.message}\n`)
        stderr.write(`      ${violation.key}\n`)
    }
}

function checkArchitecture(rootDir: string, stdout: TextWriter, stderr: TextWriter): number {
    const scan = scanModuleArchitecture({ rootDir })
    if (scan.violations.length > 0) {
        printViolations(stderr, scan.violations)
        return 1
    }

    stdout.write(`Module architecture check passed (${scan.modules.length} modules, 0 violations).\n`)
    return 0
}

export function runArchitectureCli(options: ArchitectureCliOptions = {}): number {
    const args = options.args ?? process.argv.slice(2)
    const rootDir = options.rootDir ?? process.cwd()
    const stderr = options.stderr ?? process.stderr
    const stdout = options.stdout ?? process.stdout

    if (args.length > 0) {
        stderr.write('Usage: architecture:check\n')
        return 1
    }

    try {
        return checkArchitecture(rootDir, stdout, stderr)
    } catch (error) {
        stderr.write(`Module architecture check failed: ${formatError(error)}\n`)
        return 1
    }
}

if (require.main === module) {
    process.exitCode = runArchitectureCli()
}
