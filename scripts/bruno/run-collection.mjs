import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { z } from 'zod'
import { inspectDevelopmentService, loadDevelopmentStack } from '../testing/development-stack.mjs'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
export const BRUNO_VERSION = '4.1.0'
const registry = Object.freeze({
    'bff-sessions': Object.freeze({ requests: 5, sandbox: 'developer', network: 'host' }),
    'smtp-dev': Object.freeze({ requests: 22, sandbox: 'developer', network: 'compose' }),
})

export function registeredCollection(name) {
    if (!Object.hasOwn(registry, name)) {
        throw new Error('Choose one registered Bruno collection: bff-sessions or smtp-dev')
    }
    return registry[name]
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
const passingResult = z.object({
    skipped: z.boolean().optional(),
    error: z.unknown().optional(),
    testResults: z.array(z.object({ status: z.literal('pass') })).min(1),
})

// Match the existing platform-credit launcher's fail-closed report contract.
export function assertExecutedReport(report, expectedRequests) {
    const parsed = z
        .array(
            z.object({
                skipped: z.boolean().optional(),
                summary: summarySchema,
                results: z.array(passingResult),
            }),
        )
        .length(1)
        .safeParse(report)
    if (!parsed.success) {
        throw new Error('Bruno must report successful executed requests and tests')
    }
    const [{ skipped, summary, results }] = parsed.data
    if (
        skipped ||
        results.some(result => result.skipped || result.error) ||
        summary.totalRequests !== expectedRequests ||
        summary.passedRequests !== expectedRequests ||
        results.length !== expectedRequests ||
        summary.totalTests !== summary.passedTests ||
        results.reduce((count, result) => count + result.testResults.length, 0) !== summary.totalTests
    ) {
        throw new Error('Bruno reported missing, skipped, or unsuccessful requests or tests')
    }
    return { requests: summary.totalRequests, tests: summary.totalTests }
}

const serviceClientSchema = z.object({
    issuer: z.string().url(),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
})
const serviceCredentialSchema = z.object({
    organizationId: z.string().uuid(),
    keycloakClientId: z.string().min(1),
    issuers: z.array(z.string().url()),
})

export function collectionEnvironment(name, metadata, serviceClient, serviceCredential) {
    const collection = registeredCollection(name)
    const publicIssuer = `${metadata.keycloakUrl.replace(/\/$/, '')}/realms/lead-email-finder`
    const client = serviceClientSchema.safeParse(serviceClient)
    const credential = serviceCredentialSchema.safeParse(serviceCredential)
    if (
        !client.success ||
        !credential.success ||
        client.data.issuer !== publicIssuer ||
        credential.data.keycloakClientId !== client.data.clientId ||
        !credential.data.issuers.includes(publicIssuer)
    ) {
        throw new Error('Bruno requires matching provisioned local service-client and service-credential metadata')
    }
    if (collection.network === 'host') {
        return {
            BRUNO_API_URL: metadata.apiUrl,
            OIDC_ISSUER_URL: publicIssuer,
            KEYCLOAK_SERVICE_CLIENT_ID: client.data.clientId,
            KEYCLOAK_SERVICE_CLIENT_SECRET: client.data.clientSecret,
        }
    }
    return {
        BRUNO_API_URL: 'http://api:3000',
        OIDC_ISSUER_URL: publicIssuer,
        OIDC_BACKCHANNEL_URL: 'http://keycloak:8080/realms/lead-email-finder',
        KEYCLOAK_SERVICE_CLIENT_ID: client.data.clientId,
        KEYCLOAK_SERVICE_CLIENT_SECRET: client.data.clientSecret,
        PLATFORM_ORGANIZATION_ID: credential.data.organizationId,
    }
}

export function cliArguments(name, environment, reportFile) {
    const collection = registeredCollection(name)
    if (
        !environment.BRUNO_API_URL ||
        !environment.OIDC_ISSUER_URL ||
        !environment.KEYCLOAK_SERVICE_CLIENT_ID ||
        !environment.KEYCLOAK_SERVICE_CLIENT_SECRET ||
        (collection.network === 'compose' &&
            (!environment.OIDC_BACKCHANNEL_URL ||
                !environment.PLATFORM_ORGANIZATION_ID))
    ) {
        throw new Error('Bruno collection prerequisites are missing')
    }
    return [
        'run',
        '--env',
        'local',
        '--sandbox',
        collection.sandbox,
        '--env-var',
        `baseUrl=${environment.BRUNO_API_URL}`,
        '--env-var',
        `oidcIssuerUrl=${environment.OIDC_ISSUER_URL}`,
        '--reporter-json',
        reportFile,
        '--reporter-skip-all-headers',
        '--reporter-skip-body',
    ]
}

export async function executeCollection(name, environment, checkoutRoot) {
    const collection = registeredCollection(name)
    const cliPackageFile = require.resolve('@usebruno/cli/package.json')
    const cliPackage = JSON.parse(await readFile(cliPackageFile, 'utf8'))
    if (cliPackage.version !== BRUNO_VERSION) {
        throw new Error('Install the repository-pinned Bruno CLI before running a collection')
    }
    const reportDirectory = await mkdtemp(resolve(tmpdir(), 'lef-bruno-'))
    try {
        const reportFile = resolve(reportDirectory, 'report.json')
        await execFileAsync(
            process.execPath,
            [resolve(dirname(cliPackageFile), 'bin/bru.js'), ...cliArguments(name, environment, reportFile)],
            {
                cwd: resolve(checkoutRoot, 'bruno', name),
                env: { ...process.env, ...environment },
                timeout: 240_000,
                maxBuffer: 8 * 1024 * 1024,
            },
        )
        return assertExecutedReport(JSON.parse(await readFile(reportFile, 'utf8')), collection.requests)
    } catch {
        throw new Error(
            'The registered Bruno collection failed; raw output is withheld to protect credentials and cookies',
        )
    } finally {
        await rm(reportDirectory, { recursive: true, force: true })
    }
}

// Only the host orchestrator invokes this fixed worker in a previously confirmed API container.
// Credentials cross stdin, never Docker arguments or a persistent environment file.
export const composeWorker = `
import { executeCollection } from './scripts/bruno/run-collection.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
    const { name, environment } = JSON.parse(input);
    const counts = await executeCollection(name, environment, process.cwd());
    process.stdout.write(JSON.stringify(counts));
} catch {
    process.stderr.write('The Compose-network Bruno collection failed; raw output is withheld.');
    process.exitCode = 1;
}
`

export async function runCollection(args, checkoutRoot) {
    if (args.length !== 1) {
        throw new Error('Provide exactly one registered Bruno collection name')
    }
    const [name] = args
    const collection = registeredCollection(name)
    const metadata = await loadDevelopmentStack(checkoutRoot)
    const api = await inspectDevelopmentService(checkoutRoot, metadata, 'api', '3000/tcp', metadata.apiUrl)
    await inspectDevelopmentService(checkoutRoot, metadata, 'keycloak', '8080/tcp', metadata.keycloakUrl)
    const readMetadata = async metadataFile =>
        JSON.parse(await readFile(resolve(checkoutRoot, '.dev/keycloak', metadataFile), 'utf8'))
    const environment = collectionEnvironment(
        name,
        metadata,
        await readMetadata('service-client.json'),
        await readMetadata('service-credential.json'),
    )
    if (collection.network === 'compose') {
        for (const service of ['mailpit', 'plaintext-mailpit', 'coredns', 'smtp-dev-proxy']) {
            await inspectDevelopmentService(checkoutRoot, metadata, service)
        }
        const command = execFileAsync(
            'docker',
            ['exec', '--interactive', '--workdir', '/app', api.id, 'node', '--input-type=module', '-e', composeWorker],
            { timeout: 270_000, maxBuffer: 8 * 1024 * 1024 },
        )
        // A child that exits before reading stdin still fails through its exit status.
        command.child.stdin.on('error', () => {})
        command.child.stdin.end(JSON.stringify({ name, environment }))
        const { stdout } = await command
        const counts = z
            .object({ requests: z.literal(collection.requests), tests: z.number().int().positive() })
            .parse(JSON.parse(stdout))
        return counts
    }
    return executeCollection(name, environment, checkoutRoot)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const checkoutRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    runCollection(process.argv.slice(2), checkoutRoot)
        .then(counts => {
            console.log(
                `Bruno ${BRUNO_VERSION}: ${counts.requests} requests and ${counts.tests} tests passed; no skipped requests`,
            )
        })
        .catch(() => {
            console.error(
                'Bruno failed. Confirm the registered collection, installed dependencies, and checkout-owned development stack; raw output is withheld to protect credentials and cookies.',
            )
            process.exitCode = 1
        })
}
