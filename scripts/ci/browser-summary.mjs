import { pathToFileURL } from 'node:url'

export const browserDependencies = Object.freeze(['changes', 'browser-artifacts', 'browser-ui', 'browser-live'])

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Require successful discovery and workers even when browser checks are not selected. */
export function summarizeBrowser(needs) {
    if (!isObject(needs)) {
        throw new Error('Browser dependency results must be an object.')
    }

    const keys = Object.keys(needs)
    if (keys.length !== browserDependencies.length || !browserDependencies.every(id => Object.hasOwn(needs, id))) {
        throw new Error('Browser dependency results are missing or unexpected.')
    }

    const unsuccessful = browserDependencies.filter(id => {
        const dependency = needs[id]
        return !isObject(dependency) || dependency.result !== 'success'
    })
    if (unsuccessful.length > 0) {
        throw new Error(`Browser validation did not succeed: ${unsuccessful.join(', ')}.`)
    }

    const outputs = needs.changes.outputs
    if (!isObject(outputs) || (outputs.browser !== 'true' && outputs.browser !== 'false')) {
        throw new Error('Browser selection is missing or invalid: changes.')
    }

    if (outputs.browser === 'false') {
        return 'browser: selected=false; checks were not run.'
    }

    return browserDependencies.map(id => `${id}: success`).join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const needs = JSON.parse(process.env.BROWSER_NEEDS_JSON ?? '')
        process.stdout.write(`${summarizeBrowser(needs)}\n`)
    } catch (error) {
        process.stderr.write(
            `${error instanceof SyntaxError ? 'Browser dependency results are missing or invalid JSON.' : error.message}\n`,
        )
        process.exitCode = 1
    }
}
