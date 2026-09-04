import { resolve } from 'node:path'
import { z } from 'zod'

const localUrl = z.string().url().refine(value => {
    const url = new URL(value)
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.search && !url.hash
}, 'Only loopback development endpoints are supported')

export const platformCreditsMetadataSchema = z.object({
    checkoutRoot: z.string().min(1),
    composeProject: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
    apiUrl: localUrl.refine(value => new URL(value).protocol === 'http:'),
    postgresUrl: localUrl.refine(value => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
    keycloakUrl: localUrl.refine(value => new URL(value).protocol === 'http:'),
    keycloakAdminUsername: z.string().min(1),
    keycloakAdminPassword: z.string().min(1),
}).strict()

export type PlatformCreditsMetadata = z.infer<typeof platformCreditsMetadataSchema>

export function validateMetadata(value: unknown, checkoutRoot: string): PlatformCreditsMetadata {
    const parsed = platformCreditsMetadataSchema.safeParse(value)
    if (!parsed.success || resolve(parsed.data.checkoutRoot) !== resolve(checkoutRoot)) {
        throw new Error('Invalid local Bruno metadata or checkout ownership; see bruno/platform-credits/README.md')
    }
    return parsed.data
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

export interface ComposeContainer {
    Config: { Labels: Record<string, string> }
    State: { Running: boolean }
    NetworkSettings: { Ports: Record<string, Array<{ HostIp: string; HostPort: string }> | null> }
}

export function assertOwnedContainer(
    container: ComposeContainer,
    checkoutRoot: string,
    composeProject: string,
    service: string,
    internalPort: string,
    endpoint: string,
): void {
    const labels = container.Config.Labels
    const workingDirectory = labels['com.docker.compose.project.working_dir']
    const url = new URL(endpoint)
    const hostPort = url.port || (url.protocol.startsWith('postgres') ? '5432' : '80')
    const permittedBindings = url.hostname === '127.0.0.1' ? ['127.0.0.1', '0.0.0.0']
        : url.hostname === '[::1]' ? ['::1', '::'] : ['127.0.0.1', '0.0.0.0', '::1', '::']
    if (!container.State.Running || labels['com.docker.compose.project'] !== composeProject ||
        labels['com.docker.compose.service'] !== service || !workingDirectory ||
        ![resolve(checkoutRoot), resolve(checkoutRoot, 'docker')].includes(resolve(workingDirectory)) ||
        !container.NetworkSettings.Ports[internalPort]?.some(binding => binding.HostPort === hostPort && permittedBindings.includes(binding.HostIp))) {
        throw new Error('Bruno requires running endpoint containers owned by this checkout and Compose project')
    }
}
