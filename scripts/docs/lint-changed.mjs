import { pathToFileURL } from 'node:url'

import { changedMarkdownFiles } from './harper-lint.mjs'
import { lintMarkdownFiles } from './lint.mjs'

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/iu
const ZERO_SHA_PATTERN = /^0{40}$/u

export function baseRefFromEnvironment(environment) {
    const baseSha = environment.HARPER_BASE_SHA?.trim()

    if (!baseSha || ZERO_SHA_PATTERN.test(baseSha)) {
        return 'HEAD^'
    }
    if (!FULL_SHA_PATTERN.test(baseSha)) {
        throw new Error('HARPER_BASE_SHA must be a 40-character Git commit SHA')
    }

    return baseSha
}

export async function main(environment = process.env, projectRoot = process.cwd()) {
    const baseRef = baseRefFromEnvironment(environment)
    const files = await changedMarkdownFiles(baseRef, projectRoot)

    if (files.length === 0) {
        console.log(`Harper: no Markdown files changed since ${baseRef}.`)
        return 0
    }

    console.log(`Harper: linting ${files.length} Markdown file(s) changed since ${baseRef}.`)
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
