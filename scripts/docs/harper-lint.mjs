import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function parseDictionary(source) {
    return source
        .split(/\r?\n/u)
        .map(word => word.trim())
        .filter(Boolean)
}

export function normalizeTargets(args) {
    return args.filter(argument => argument !== '--')
}

export function sourcePosition(source, scalarOffset) {
    const prefix = Array.from(source).slice(0, scalarOffset).join('')
    const lines = prefix.split('\n')

    return {
        line: lines.length,
        column: Array.from(lines.at(-1)).length + 1,
    }
}

export function diagnosticFromLint(file, source, lint) {
    const span = lint.span()
    const position = sourcePosition(source, span.start)
    const suggestions = lint
        .suggestions()
        .map(suggestion => suggestion.get_replacement_text())
        .filter(Boolean)

    return {
        file,
        ...position,
        kind: lint.lint_kind_pretty(),
        message: lint.message(),
        problem: lint.get_problem_text(),
        suggestions,
    }
}

function compactText(value) {
    return value.replace(/\s+/gu, ' ').trim()
}

export function formatDiagnostic(diagnostic) {
    const suggestion = diagnostic.suggestions.length
        ? ` Suggestions: ${diagnostic.suggestions.map(value => JSON.stringify(compactText(value))).join(', ')}`
        : ''

    return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} [${diagnostic.kind}] ${compactText(diagnostic.message)} Found: ${JSON.stringify(compactText(diagnostic.problem))}.${suggestion}`
}

async function markdownFilesInDirectory(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
            continue
        }

        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            files.push(...(await markdownFilesInDirectory(entryPath)))
        } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
            files.push(entryPath)
        }
    }

    return files
}

async function explicitMarkdownFiles(targets, projectRoot) {
    const files = []

    for (const target of targets) {
        const absoluteTarget = path.resolve(projectRoot, target)
        const targetStat = await stat(absoluteTarget)

        if (targetStat.isDirectory()) {
            files.push(...(await markdownFilesInDirectory(absoluteTarget)))
        } else if (targetStat.isFile() && path.extname(absoluteTarget).toLowerCase() === '.md') {
            files.push(absoluteTarget)
        } else {
            throw new Error(`Not a Markdown file or directory: ${target}`)
        }
    }

    return files
}

async function trackedMarkdownFiles(projectRoot) {
    const { stdout } = await execFileAsync('git', ['ls-files', '--', '*.md'], {
        cwd: projectRoot,
        encoding: 'utf8',
    })

    return stdout
        .split(/\r?\n/u)
        .filter(Boolean)
        .map(file => path.resolve(projectRoot, file))
}

export async function resolveMarkdownFiles(targets, projectRoot) {
    const files = targets.length
        ? await explicitMarkdownFiles(targets, projectRoot)
        : await trackedMarkdownFiles(projectRoot)

    return [...new Set(files)].sort()
}

export async function changedMarkdownFiles(baseRef, projectRoot, headRef = 'HEAD') {
    const { stdout } = await execFileAsync(
        'git',
        ['diff', '--name-only', '--diff-filter=ACMR', '-z', baseRef, headRef, '--', '*.md'],
        {
            cwd: projectRoot,
            encoding: 'buffer',
        },
    )

    return stdout
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map(file => path.resolve(projectRoot, file))
        .sort()
}

export async function lintFiles({ files, linter, projectRoot, report = console.log, maxReportedDiagnostics = 200 }) {
    let diagnosticCount = 0

    for (const file of files) {
        const source = await readFile(file, 'utf8')
        const lints = await linter.lint(source, { language: 'markdown' })
        const displayFile = path.relative(projectRoot, file) || path.basename(file)

        for (const lint of lints) {
            if (diagnosticCount < maxReportedDiagnostics) {
                report(formatDiagnostic(diagnosticFromLint(displayFile, source, lint)))
            }
            diagnosticCount += 1
        }
    }

    if (diagnosticCount > maxReportedDiagnostics) {
        report(`Harper: ${diagnosticCount - maxReportedDiagnostics} additional issue(s) not shown.`)
    }

    return diagnosticCount
}

export async function loadWorkspaceDictionary(projectRoot) {
    const dictionaryPath = path.join(projectRoot, '.harper-dictionary.txt')
    return parseDictionary(await readFile(dictionaryPath, 'utf8'))
}
