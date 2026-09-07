import { z } from 'zod'

const stages = ['fixture_bootstrap', 'collection', 'report', 'balance_restore']
const diagnosticSchema = z
    .object({
        stage: z.enum(stages),
        request: z.number().int().min(1).max(10_000).optional(),
        status: z.number().int().min(100).max(599).optional(),
        requests: z.number().int().min(0).max(10_000).optional(),
        tests: z.number().int().min(0).max(100_000).optional(),
    })
    .strict()
const envelopeSchema = z.object({ diagnostic: diagnosticSchema }).strict()

class BrunoDiagnosticError extends Error {
    constructor(diagnostic) {
        super('The registered Bruno collection failed; raw output is withheld to protect credentials and cookies')
        this.diagnostic = diagnosticSchema.parse(diagnostic)
    }
}

export function brunoFailure(diagnostic) {
    const parsed = diagnosticSchema.safeParse(diagnostic)
    return new BrunoDiagnosticError(parsed.success ? parsed.data : { stage: 'collection' })
}

export function failureDiagnostic(error, fallback = 'fixture_bootstrap') {
    const parsed = error instanceof BrunoDiagnosticError ? diagnosticSchema.safeParse(error.diagnostic) : undefined
    return parsed?.success ? parsed.data : { stage: stages.includes(fallback) ? fallback : 'fixture_bootstrap' }
}

function boundedInteger(value, minimum, maximum) {
    return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

// Read only bounded numeric facts. Request identity is its one-based report position, never a supplied name or URL.
export function reportFailureDiagnostic(report, stage) {
    const diagnostic = { stage }
    const iteration = Array.isArray(report) && report.length === 1 ? report[0] : undefined
    if (boundedInteger(iteration?.summary?.totalRequests, 0, 10_000))
        diagnostic.requests = iteration.summary.totalRequests
    if (boundedInteger(iteration?.summary?.totalTests, 0, 100_000)) diagnostic.tests = iteration.summary.totalTests
    if (Array.isArray(iteration?.results) && iteration.results.length <= 10_000) {
        const index = iteration.results.findIndex(
            result =>
                !result ||
                result.skipped ||
                result.error ||
                !Array.isArray(result.testResults) ||
                result.testResults.length === 0 ||
                result.testResults.some(test => test?.status !== 'pass') ||
                [result.assertionResults, result.preRequestTestResults, result.postResponseTestResults].some(
                    tests => Array.isArray(tests) && tests.some(test => test?.status !== 'pass'),
                ),
        )
        if (index !== -1) {
            diagnostic.request = index + 1
            const status = iteration.results[index]?.response?.status
            if (boundedInteger(status, 100, 599)) diagnostic.status = status
        }
    }
    return failureDiagnostic(brunoFailure(diagnostic), 'collection')
}

export function composeFailureOutput(error) {
    return JSON.stringify({ diagnostic: failureDiagnostic(error, 'collection') })
}

export function parseComposeFailure(output) {
    try {
        if (typeof output !== 'string' || output.length > 4096) return brunoFailure({ stage: 'collection' })
        const parsed = envelopeSchema.safeParse(JSON.parse(output))
        return brunoFailure(parsed.success ? parsed.data.diagnostic : { stage: 'collection' })
    } catch {
        return brunoFailure({ stage: 'collection' })
    }
}

export function formatFailureDiagnostic(error) {
    return JSON.stringify(failureDiagnostic(error))
}
