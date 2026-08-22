import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { binary } from 'harper.js/binary'
import { Dialect, LocalLinter } from 'harper.js'

import {
    changedMarkdownFiles,
    diagnosticFromLint,
    lintFiles,
    normalizeTargets,
    parseDictionary,
    resolveMarkdownFiles,
    sourcePosition,
} from './harper-lint.mjs'
import { baseRefFromEnvironment } from './lint-changed.mjs'

const temporaryRoot = process.platform === 'linux' ? '/tmp' : os.tmpdir()

test('parseDictionary removes blank lines and surrounding whitespace', () => {
    assert.deepEqual(parseDictionary('TupoSoft\n\n  TypeORM  \r\n'), ['TupoSoft', 'TypeORM'])
})

test('normalizeTargets removes pnpm argument separators', () => {
    assert.deepEqual(normalizeTargets(['--', 'README.md']), ['README.md'])
})

test('baseRefFromEnvironment uses a commit SHA and falls back for non-push events', () => {
    const sha = 'a'.repeat(40)

    assert.equal(baseRefFromEnvironment({ HARPER_BASE_SHA: sha }), sha)
    assert.equal(baseRefFromEnvironment({ HARPER_BASE_SHA: '0'.repeat(40) }), 'HEAD^')
    assert.equal(baseRefFromEnvironment({}), 'HEAD^')
    assert.throws(() => baseRefFromEnvironment({ HARPER_BASE_SHA: 'origin/master' }), /40-character Git commit SHA/u)
})

test('sourcePosition counts Unicode scalar values', () => {
    assert.deepEqual(sourcePosition('First line\n😀 text', 12), {
        line: 2,
        column: 2,
    })
})

test('diagnosticFromLint maps a Harper lint to a source location', () => {
    const lint = {
        span: () => ({ start: 5, end: 7 }),
        lint_kind_pretty: () => 'Grammar',
        message: () => 'Incorrect indefinite article.',
        get_problem_text: () => 'an',
        suggestions: () => [{ get_replacement_text: () => 'a' }, { get_replacement_text: () => '' }],
    }

    assert.deepEqual(diagnosticFromLint('README.md', 'This an test.', lint), {
        file: 'README.md',
        line: 1,
        column: 6,
        kind: 'Grammar',
        message: 'Incorrect indefinite article.',
        problem: 'an',
        suggestions: ['a'],
    })
})

test('resolveMarkdownFiles expands directories and ignores dependency trees', async () => {
    const directory = await mkdtemp(path.join(temporaryRoot, 'harper-files-'))

    try {
        await mkdir(path.join(directory, 'docs'))
        await mkdir(path.join(directory, 'node_modules'))
        await writeFile(path.join(directory, 'README.md'), '# Read me\n')
        await writeFile(path.join(directory, 'docs', 'guide.MD'), '# Guide\n')
        await writeFile(path.join(directory, 'docs', 'notes.txt'), 'Notes\n')
        await writeFile(path.join(directory, 'node_modules', 'ignored.md'), '# Ignore\n')

        assert.deepEqual(await resolveMarkdownFiles(['.'], directory), [
            path.join(directory, 'README.md'),
            path.join(directory, 'docs', 'guide.MD'),
        ])
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('changedMarkdownFiles returns added and modified Markdown but not deleted files', async () => {
    const directory = await mkdtemp(path.join(temporaryRoot, 'harper-git-'))
    const git = (...args) =>
        execFileSync('git', args, {
            cwd: directory,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim()

    try {
        git('init', '--quiet')
        await writeFile(path.join(directory, 'README.md'), '# Initial\n')
        await writeFile(path.join(directory, 'deleted.md'), '# Delete me\n')
        await writeFile(path.join(directory, 'notes.txt'), 'Initial notes\n')
        git('add', '.')
        git('-c', 'user.name=Harper Test', '-c', 'user.email=harper@example.com', 'commit', '--quiet', '-m', 'base')
        const baseSha = git('rev-parse', 'HEAD')

        await writeFile(path.join(directory, 'README.md'), '# Updated\n')
        await writeFile(path.join(directory, 'guide.md'), '# Guide\n')
        await writeFile(path.join(directory, 'notes.txt'), 'Updated notes\n')
        await rm(path.join(directory, 'deleted.md'))
        git('add', '--all')
        git('-c', 'user.name=Harper Test', '-c', 'user.email=harper@example.com', 'commit', '--quiet', '-m', 'change')

        assert.deepEqual(await changedMarkdownFiles(baseSha, directory), [
            path.join(directory, 'README.md'),
            path.join(directory, 'guide.md'),
        ])
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('lintFiles reports every diagnostic and returns the total', async () => {
    const directory = await mkdtemp(path.join(temporaryRoot, 'harper-lint-'))
    const file = path.join(directory, 'README.md')
    const reports = []

    try {
        await writeFile(file, 'This is an test.\n')
        const linter = {
            lint: async () => [
                {
                    span: () => ({ start: 8, end: 10 }),
                    lint_kind_pretty: () => 'Grammar',
                    message: () => 'Incorrect indefinite article.',
                    get_problem_text: () => 'an',
                    suggestions: () => [{ get_replacement_text: () => 'a' }],
                },
            ],
        }

        assert.equal(
            await lintFiles({
                files: [file],
                linter,
                projectRoot: directory,
                report: diagnostic => reports.push(diagnostic),
            }),
            1,
        )
        assert.deepEqual(reports, [
            'README.md:1:9 [Grammar] Incorrect indefinite article. Found: "an". Suggestions: "a"',
        ])
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('lintFiles caps diagnostic output while retaining the total', async () => {
    const directory = await mkdtemp(path.join(temporaryRoot, 'harper-cap-'))
    const file = path.join(directory, 'README.md')
    const reports = []

    try {
        await writeFile(file, 'This is an test.\n')
        const lint = {
            span: () => ({ start: 8, end: 10 }),
            lint_kind_pretty: () => 'Grammar',
            message: () => 'Incorrect indefinite article.',
            get_problem_text: () => 'an',
            suggestions: () => [{ get_replacement_text: () => 'a' }],
        }

        assert.equal(
            await lintFiles({
                files: [file],
                linter: { lint: async () => [lint, lint, lint] },
                projectRoot: directory,
                report: diagnostic => reports.push(diagnostic),
                maxReportedDiagnostics: 1,
            }),
            3,
        )
        assert.equal(reports.length, 2)
        assert.equal(reports[1], 'Harper: 2 additional issue(s) not shown.')
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('Harper detects grammar errors and accepts workspace words', async () => {
    const linter = new LocalLinter({ binary, dialect: Dialect.American })

    try {
        await linter.importWords(['TupoSoft'])
        const lints = await linter.lint('TupoSoft says this is an test.', {
            language: 'markdown',
        })

        assert.ok(lints.some(lint => lint.message() === 'Incorrect indefinite article.'))
        assert.ok(lints.every(lint => lint.get_problem_text() !== 'TupoSoft'))
    } finally {
        await linter.dispose()
    }
})
