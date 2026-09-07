import { pathToFileURL } from 'node:url'

export const validationDependencies = Object.freeze([
    'changes',
    'repository-policy',
    'backend',
    'web',
    'contract',
    'images',
    'browser',
])

/** Validate the complete aggregate input before accepting any dependency result. */
export function summarizeValidation(needs) {
    if (needs === null || typeof needs !== 'object' || Array.isArray(needs)) {
        throw new Error('Validation dependency results must be an object.')
    }

    const keys = Object.keys(needs)
    if (
        keys.length !== validationDependencies.length ||
        !validationDependencies.every((id) => Object.hasOwn(needs, id))
    ) {
        throw new Error('Validation dependency results are missing or unexpected.')
    }

    const unsuccessful = validationDependencies.filter((id) => {
        const dependency = needs[id]
        return (
            dependency === null ||
            typeof dependency !== 'object' ||
            Array.isArray(dependency) ||
            dependency.result !== 'success'
        )
    })
    if (unsuccessful.length > 0) {
        throw new Error(`Validation did not succeed: ${unsuccessful.join(', ')}.`)
    }

    return validationDependencies.map((id) => `${id}: success`).join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const needs = JSON.parse(process.env.VALIDATION_NEEDS_JSON ?? '')
        process.stdout.write(`${summarizeValidation(needs)}\n`)
    } catch (error) {
        process.stderr.write(
            `${error instanceof SyntaxError ? 'Validation dependency results are missing or invalid JSON.' : error.message}\n`,
        )
        process.exitCode = 1
    }
}
