import { pathToFileURL } from 'node:url'

import { binary } from 'harper.js/binary'
import { Dialect, LocalLinter } from 'harper.js'

import { lintFiles, loadWorkspaceDictionary, normalizeTargets, resolveMarkdownFiles } from './harper-lint.mjs'

export async function lintMarkdownFiles(files, projectRoot) {
    if (files.length === 0) {
        console.log('Harper: no Markdown files found.')
        return 0
    }

    const linter = new LocalLinter({ binary, dialect: Dialect.American })

    try {
        await linter.importWords(await loadWorkspaceDictionary(projectRoot))
        const diagnosticCount = await lintFiles({ files, linter, projectRoot })

        if (diagnosticCount === 0) {
            console.log(`Harper: ${files.length} file(s) passed.`)
            return 0
        }

        console.error(`Harper: found ${diagnosticCount} issue(s) in ${files.length} file(s).`)
        return 1
    } finally {
        await linter.dispose()
    }
}

export async function main(args = process.argv.slice(2), projectRoot = process.cwd()) {
    const files = await resolveMarkdownFiles(normalizeTargets(args), projectRoot)
    return lintMarkdownFiles(files, projectRoot)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        process.exitCode = await main()
    } catch (error) {
        console.error(`Harper: ${error instanceof Error ? error.message : String(error)}`)
        process.exitCode = 2
    }
}
