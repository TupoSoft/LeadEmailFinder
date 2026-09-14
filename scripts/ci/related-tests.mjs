import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Discover import-related tests without executing test files or callbacks. */
export async function discoverRelatedTests(suite, absolutePaths, repository) {
    const related = new Map()
    if (suite === 'backend') {
        const deadline = Date.now() + 30_000
        for (const source of absolutePaths) {
            const remaining = deadline - Date.now()
            if (remaining <= 0) throw new Error('Backend related test discovery exceeded its 30-second budget')
            const output = execFileSync('corepack', [
                'pnpm', 'exec', 'jest', '--runInBand', '--listTests', '--json', '--findRelatedTests', source,
            ], {
                cwd: repository,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: remaining,
                maxBuffer: 16 * 1024 * 1024,
            })
            related.set(source, JSON.parse(output))
        }
        return related
    }
    if (suite !== 'web') throw new Error(`Unsupported test suite: ${suite}`)
    if (absolutePaths.length === 0) return related

    const originalEnvironment = { ...process.env }
    let context
    let originalRelated
    try {
        const webRoot = resolve(repository, 'apps/web')
        const requireFromWeb = createRequire(resolve(webRoot, 'package.json'))
        const { createVitest } = await import(pathToFileURL(requireFromWeb.resolve('vitest/node')).href)
        context = await createVitest('test', {
            root: webRoot,
            watch: false,
            run: true,
            related: [],
            maxWorkers: 1,
        })
        originalRelated = context.config.related
        // Query separately so one covered input cannot conceal an orphan input.
        // This public resolved option is shared: queries must stay sequential.
        for (const source of absolutePaths) {
            context.config.related = [source]
            const specifications = await context.getRelevantTestSpecifications()
            related.set(source, specifications.map(specification => specification.moduleId))
        }
    } finally {
        try {
            if (context) {
                context.config.related = originalRelated
                await context.close()
            }
        } finally {
            // Vite initializes NODE_ENV and import.meta.env values in this process.
            // The actual test command must receive the caller's original environment.
            for (const key of Object.keys(process.env)) {
                if (!Object.hasOwn(originalEnvironment, key)) delete process.env[key]
            }
            Object.assign(process.env, originalEnvironment)
        }
    }
    return related
}
