import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { z } from 'zod'

export interface PlatformCreditsMetadata {
    checkoutRoot: string
    composeProject: string
    apiUrl: string
    postgresUrl: string
    keycloakUrl: string
    keycloakAdminUsername: string
    keycloakAdminPassword: string
}

interface DevelopmentStackDiscovery {
    loadDevelopmentStack: (checkoutRoot: string, options: { persistMetadata: boolean }) => PlatformCreditsMetadata
}

/** Reuse live Docker ownership checks and credential discovery without writing another metadata file. */
export function loadPlatformCreditsStack(
    checkoutRoot: string,
    discovery?: DevelopmentStackDiscovery,
): PlatformCreditsMetadata {
    const shared = discovery ?? createRequire(__filename)('../testing/development-stack.mjs') as DevelopmentStackDiscovery
    return shared.loadDevelopmentStack(resolve(checkoutRoot), { persistMetadata: false })
}

const summarySchema = z.object({
    totalRequests: z.number().int().positive(),
    passedRequests: z.number().int().positive(),
    failedRequests: z.literal(0),
    errorRequests: z.literal(0),
    skippedRequests: z.literal(0),
    totalTests: z.number().int().positive(),
    passedTests: z.number().int().positive(),
    failedTests: z.literal(0),
    failedAssertions: z.literal(0),
})

const resultSchema = z.object({
    skipped: z.boolean().optional(),
    error: z.unknown().optional(),
    testResults: z.array(z.object({ status: z.literal('pass') })).min(1),
})

export function assertExecutedBrunoReport(report: unknown, expectedRequests: number): { requests: number; tests: number } {
    const parsed = z.array(z.object({
        skipped: z.boolean().optional(),
        summary: summarySchema,
        results: z.array(resultSchema),
    })).length(1).safeParse(report)
    if (!parsed.success) {
        throw new Error('Bruno did not produce a complete successful report with executed requests and tests')
    }
    const [{ skipped, summary, results }] = parsed.data
    if (skipped || results.some(result => result.skipped || result.error) ||
        results.length !== expectedRequests || summary.totalRequests !== expectedRequests ||
        summary.passedRequests !== expectedRequests || summary.totalTests !== summary.passedTests ||
        results.reduce((count, result) => count + result.testResults.length, 0) !== summary.totalTests) {
        throw new Error('Bruno reported missing, skipped, or unsuccessful requests or tests')
    }
    return { requests: summary.totalRequests, tests: summary.totalTests }
}
