import { execFile } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { z } from 'zod'
import { inspectDevelopmentService, loadDevelopmentStack } from '../testing/development-stack.mjs'
import { withExpiredInvitation } from './invitation-expiry-fixture.mjs'
import {
    customerClientSecret,
    validateCustomerFixture,
    withAsyncVerificationFixture,
} from './async-verification-fixture.mjs'
import {
    brunoFailure,
    formatFailureDiagnostic,
    parseComposeFailure,
    reportFailureDiagnostic,
} from './failure-diagnostic.mjs'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)
export const BRUNO_VERSION = '4.1.0'
const registry = Object.freeze({
    'bff-sessions': Object.freeze({ requests: 15, tests: 16, sandbox: 'developer', network: 'host' }),
    'async-verification': Object.freeze({ requests: 15, tests: 15, sandbox: 'developer', network: 'compose' }),
    'batch-verification': Object.freeze({ requests: 9, tests: 15, sandbox: 'developer', network: 'compose' }),
    'smtp-dev': Object.freeze({ requests: 47, sandbox: 'developer', network: 'compose' }),
    'credit-purchases': Object.freeze({ requests: 33, sandbox: 'developer', network: 'host' }),
    'proxy-registry': Object.freeze({
        requests: 27,
        tests: 27,
        sandbox: 'developer',
        network: 'host',
        countOnly: true,
    }),
    'service-client-management': Object.freeze({
        requests: 6,
        tests: 6,
        sandbox: 'developer',
        network: 'host',
        countOnly: true,
    }),
    'organization-onboarding': Object.freeze({
        requests: 23,
        tests: 23,
        sandbox: 'developer',
        network: 'host',
        countOnly: true,
    }),
})

export function registeredCollection(name) {
    if (!Object.hasOwn(registry, name)) {
        throw new Error('Choose a registered Bruno collection')
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
export function assertExecutedReport(report, expectedRequests, expectedTests) {
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
        (expectedTests !== undefined && summary.totalTests !== expectedTests) ||
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
            ...(name === 'credit-purchases' ? { PLATFORM_ORGANIZATION_ID: credential.data.organizationId } : {}),
            ...(name === 'service-client-management'
                ? { SERVICE_CLIENT_ORGANIZATION_ID: credential.data.organizationId }
                : {}),
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
        (['async-verification', 'batch-verification'].includes(name) &&
            (!environment.CUSTOMER_ORGANIZATION_ID ||
                !environment.CUSTOMER_SERVICE_CLIENT_ID ||
                !environment.CUSTOMER_SERVICE_CLIENT_SECRET)) ||
        (name === 'organization-onboarding' &&
            (!environment.BRUNO_EXPIRED_INVITATION_TOKEN ||
                !environment.CUSTOMER_SERVICE_CLIENT_ID ||
                !environment.CUSTOMER_SERVICE_CLIENT_SECRET)) ||
        (name === 'service-client-management' && !environment.SERVICE_CLIENT_ORGANIZATION_ID) ||
        (name === 'credit-purchases' &&
            (!environment.PAYMENTS_STUB_WEBHOOK_SECRET || !environment.PLATFORM_ORGANIZATION_ID)) ||
        (collection.network === 'compose' &&
            (!environment.OIDC_BACKCHANNEL_URL || !environment.PLATFORM_ORGANIZATION_ID))
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
    const reportFile = resolve(reportDirectory, 'report.json')
    let stage = 'collection'
    try {
        await execFileAsync(
            process.execPath,
            [
                ...(collection.countOnly
                    ? ['--import', resolve(checkoutRoot, 'scripts/bruno/count-only-reporter.mjs')]
                    : []),
                resolve(dirname(cliPackageFile), 'bin/bru.js'),
                ...cliArguments(name, environment, reportFile),
            ],
            {
                cwd: resolve(checkoutRoot, 'bruno', name),
                env: {
                    ...process.env,
                    ...environment,
                    ...(collection.countOnly ? { LEF_BRUNO_COUNTS_REPORT: reportFile } : {}),
                },
                timeout: 240_000,
                maxBuffer: 8 * 1024 * 1024,
            },
        )
        stage = 'report'
        return assertExecutedReport(
            JSON.parse(await readFile(reportFile, 'utf8')),
            collection.requests,
            collection.tests,
        )
    } catch {
        let report
        try {
            report = JSON.parse(await readFile(reportFile, 'utf8'))
        } catch {
            /* No trustworthy report is available. */
        }
        throw brunoFailure(reportFailureDiagnostic(report, stage))
    } finally {
        await rm(reportDirectory, { recursive: true, force: true })
    }
}

// Only the host orchestrator invokes this fixed worker in a previously confirmed API container.
// Credentials cross stdin, never Docker arguments or a persistent environment file.
export const composeWorker = `
import { executeCollection } from './scripts/bruno/run-collection.mjs';
import { composeFailureOutput } from './scripts/bruno/failure-diagnostic.mjs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
    const { name, environment } = JSON.parse(input);
    const counts = await executeCollection(name, environment, process.cwd());
    process.stdout.write(JSON.stringify(counts));
} catch (error) {
    process.stdout.write(composeFailureOutput(error));
    process.stderr.write('The Compose-network Bruno collection failed; raw output is withheld.');
    process.exitCode = 1;
}
`

// The caller must confirm container ownership before reading its development-only configuration.
// Never infer the webhook signing key from a browser response or publish it in CLI arguments.
export async function stubPaymentEnvironment(container, checkoutRoot, apiUrl) {
    const environment = Object.fromEntries(
        (container.Config?.Env ?? []).map(value => [
            value.slice(0, value.indexOf('=')),
            value.slice(value.indexOf('=') + 1),
        ]),
    )
    if (environment.PAYMENTS_PROVIDER !== 'stub') throw new Error('Credit purchase fixtures require the stub provider')
    let returnUrl
    try {
        returnUrl = new URL(environment.PAYMENTS_CHECKOUT_URL)
    } catch {
        throw new Error('Credit purchase fixtures require a same-origin return URL')
    }
    if (returnUrl.origin !== new URL(apiUrl).origin || returnUrl.pathname !== '/billing/complete') {
        throw new Error('Credit purchase fixtures require a same-origin return URL')
    }
    let secret = environment.PAYMENTS_STUB_WEBHOOK_SECRET
    if (environment.PAYMENTS_STUB_WEBHOOK_SECRET_FILE) {
        const mount = container.Mounts?.find(
            candidate =>
                candidate.Type === 'bind' && candidate.Destination === environment.PAYMENTS_STUB_WEBHOOK_SECRET_FILE,
        )
        const expected = resolve(checkoutRoot, 'docker/secrets/payments_stub_webhook_secret.txt')
        if (!mount || (await realpath(mount.Source)) !== expected) {
            throw new Error('Stub webhook secret must belong to this checkout')
        }
        secret = (await readFile(expected, 'utf8')).trim()
    }
    if (!secret?.trim()) throw new Error('The configured stub webhook secret is missing')
    return { PAYMENTS_STUB_WEBHOOK_SECRET: secret }
}

async function bootstrapCreditPurchaseCredential(checkoutRoot, metadata) {
    await execFileAsync(
        process.execPath,
        [require.resolve('ts-node/dist/bin.js'), 'scripts/keycloak/bootstrap-credential.ts'],
        {
            cwd: checkoutRoot,
            env: {
                ...process.env,
                KEYCLOAK_URL: metadata.keycloakUrl,
                KEYCLOAK_ADMIN_USERNAME: metadata.keycloakAdminUsername,
                KEYCLOAK_ADMIN_PASSWORD: metadata.keycloakAdminPassword,
                POSTGRES_URL: metadata.postgresUrl,
                KEYCLOAK_DEV_SECRETS_FILE: resolve(checkoutRoot, '.dev/keycloak/service-client.json'),
                KEYCLOAK_DEV_BOOTSTRAP_FILE: resolve(checkoutRoot, '.dev/keycloak/service-credential.json'),
            },
            timeout: 120_000,
            maxBuffer: 1024 * 1024,
        },
    )
}

export async function runCollection(args, checkoutRoot) {
    if (args.length !== 1) {
        throw new Error('Provide exactly one registered Bruno collection name')
    }
    const [name] = args
    const collection = registeredCollection(name)
    const metadata = await loadDevelopmentStack(checkoutRoot)
    const api = await inspectDevelopmentService(checkoutRoot, metadata, 'api')
    await inspectDevelopmentService(checkoutRoot, metadata, 'web', '8080/tcp', metadata.apiUrl)
    await inspectDevelopmentService(checkoutRoot, metadata, 'keycloak', '8080/tcp', metadata.keycloakUrl)
    const paymentEnvironment =
        name === 'credit-purchases' ? await stubPaymentEnvironment(api.container, checkoutRoot, metadata.apiUrl) : {}
    if (name === 'credit-purchases') await bootstrapCreditPurchaseCredential(checkoutRoot, metadata)
    const readMetadata = async metadataFile =>
        JSON.parse(await readFile(resolve(checkoutRoot, '.dev/keycloak', metadataFile), 'utf8'))
    const environment = collectionEnvironment(
        name,
        metadata,
        await readMetadata('service-client.json'),
        await readMetadata('service-credential.json'),
    )
    Object.assign(environment, paymentEnvironment)
    if (name === 'organization-onboarding') {
        await inspectDevelopmentService(checkoutRoot, metadata, 'postgres', '5432/tcp', metadata.postgresUrl)
        const credential = await readMetadata('service-credential.json')
        const customer = validateCustomerFixture(
            await readMetadata('customer-fixture.json'),
            environment.OIDC_ISSUER_URL,
            credential.organizationId,
        )
        const customerSecret = await customerClientSecret(metadata, customer.keycloakClientId)
        return withExpiredInvitation(metadata, credential.organizationId, environment.OIDC_ISSUER_URL, token =>
            executeCollection(
                name,
                {
                    ...environment,
                    BRUNO_EXPIRED_INVITATION_TOKEN: token,
                    CUSTOMER_SERVICE_CLIENT_ID: customer.keycloakClientId,
                    CUSTOMER_SERVICE_CLIENT_SECRET: customerSecret,
                },
                checkoutRoot,
            ),
        )
    }
    if (collection.network === 'compose') {
        for (const service of ['smtp-evidence', 'plaintext-mailpit', 'coredns', 'smtp-dev-proxy']) {
            await inspectDevelopmentService(checkoutRoot, metadata, service)
        }
        const runCompose = async fixtureEnvironment => {
            const command = execFileAsync(
                'docker',
                [
                    'exec',
                    '--interactive',
                    '--workdir',
                    '/app',
                    api.id,
                    'node',
                    '--input-type=module',
                    '-e',
                    composeWorker,
                ],
                { timeout: 270_000, maxBuffer: 8 * 1024 * 1024 },
            )
            // A child that exits before reading stdin still fails through its exit status.
            command.child.stdin.on('error', () => {})
            command.child.stdin.end(JSON.stringify({ name, environment: fixtureEnvironment }))
            let stdout
            try {
                ;({ stdout } = await command)
            } catch (error) {
                throw parseComposeFailure(error.stdout)
            }
            try {
                return z
                    .object({
                        requests: z.literal(collection.requests),
                        tests:
                            collection.tests === undefined ? z.number().int().positive() : z.literal(collection.tests),
                    })
                    .strict()
                    .parse(JSON.parse(stdout))
            } catch {
                throw brunoFailure({ stage: 'report' })
            }
        }
        if (['async-verification', 'batch-verification'].includes(name)) {
            return withAsyncVerificationFixture(
                checkoutRoot,
                async fixture => {
                    if (name === 'batch-verification') await fixture.setBalance(2)
                    return runCompose({ ...environment, ...fixture.environment })
                },
                { useOrganizationAdmin: name === 'batch-verification' },
            )
        }
        return runCompose(environment)
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
        .catch(error => {
            console.error(
                `Bruno failed ${formatFailureDiagnostic(error)}. Confirm the registered collection, installed dependencies, and checkout-owned development stack; raw output is withheld to protect credentials and cookies.`,
            )
            process.exitCode = 1
        })
}
