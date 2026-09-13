import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const metadataSchema = z.object({
    checkoutRoot: z.string(),
    projectName: z.string(),
    composeFile: z.string(),
    TEST_VERIFICATION_BILLING_POSTGRES_URL: z.string(),
})

export function verificationBillingProjectName(checkoutRoot: string): string {
    return `lef-verification-billing-${createHash('sha256').update(checkoutRoot).digest('hex').slice(0, 12)}`
}

export function validateVerificationBillingMetadata(
    value: unknown,
    checkoutRoot: string,
): z.infer<typeof metadataSchema> {
    const result = metadataSchema.safeParse(value)
    if (!result.success) throw new Error('Invalid ignored verification-billing PostgreSQL metadata')
    const metadata = result.data
    if (
        metadata.checkoutRoot !== checkoutRoot ||
        metadata.projectName !== verificationBillingProjectName(checkoutRoot) ||
        metadata.composeFile !== resolve(checkoutRoot, 'docker/compose.verification-billing-test.yaml')
    )
        throw new Error('Verification-billing PostgreSQL metadata does not belong to this checkout')
    let url: URL
    try {
        url = new URL(metadata.TEST_VERIFICATION_BILLING_POSTGRES_URL)
    } catch {
        throw new Error('Invalid verification-billing PostgreSQL test connection')
    }
    if (
        url.protocol !== 'postgresql:' ||
        url.hostname !== '127.0.0.1' ||
        !url.port ||
        url.username !== 'postgres' ||
        !url.password ||
        url.pathname !== '/verification_billing_test' ||
        url.search ||
        url.hash
    )
        throw new Error(
            'Verification-billing PostgreSQL must use the checkout-owned loopback verification_billing_test database',
        )
    return metadata
}

export function assertVerificationBillingContainer(
    labels: Record<string, string>,
    checkoutRoot: string,
    composeFile: string,
): void {
    if (
        labels['com.docker.compose.project'] !== verificationBillingProjectName(checkoutRoot) ||
        labels['com.docker.compose.project.working_dir'] !== checkoutRoot ||
        labels['com.docker.compose.project.config_files'] !== composeFile ||
        labels['com.docker.compose.service'] !== 'verification-billing-postgres'
    )
        throw new Error('Refusing a PostgreSQL container not owned by this checkout and test Compose file')
}

const REQUIRED_VERIFICATION_BILLING_POSTGRES_SUITES = ['verification-billing.integration.spec.ts'] as const

export function passedVerificationBillingTests(value: unknown): number {
    const report = z
        .object({
            success: z.literal(true),
            numPassedTests: z.number().int().positive(),
            numTotalTests: z.number().int().positive(),
            numPendingTests: z.literal(0),
            numFailedTests: z.literal(0),
            numFailedTestSuites: z.literal(0),
            numPendingTestSuites: z.literal(0),
            testResults: z.array(z.object({ name: z.string() })).nonempty(),
        })
        .safeParse(value)
    if (!report.success || report.data.numPassedTests !== report.data.numTotalTests) {
        throw new Error('Verification-billing PostgreSQL suite failed, skipped tests, or executed zero tests')
    }
    const suiteNames = report.data.testResults.map(result => result.name)
    const missingSuites = REQUIRED_VERIFICATION_BILLING_POSTGRES_SUITES.filter(
        suite => !suiteNames.some(name => name.endsWith(suite)),
    )
    if (missingSuites.length > 0) {
        throw new Error('Verification-billing PostgreSQL report is missing a required test suite')
    }
    return report.data.numPassedTests
}

function command(program: string, args: string[], cwd: string, env = process.env): string {
    const result = spawnSync(program, args, {
        cwd,
        env,
        encoding: 'utf8',
        timeout: 180_000,
        maxBuffer: 10 * 1024 * 1024,
    })
    // Child diagnostics can contain passwords or full connection URLs. Return only controlled messages.
    if (result.error || result.status !== 0)
        throw new Error(`${program} failed during verification-billing PostgreSQL validation`)
    return result.stdout.trim()
}

export function runVerificationBillingPostgres(): void {
    const checkoutRoot = realpathSync(resolve(__dirname, '../..'))
    const projectName = verificationBillingProjectName(checkoutRoot)
    const composeFile = resolve(checkoutRoot, 'docker/compose.verification-billing-test.yaml')
    const directory = resolve(checkoutRoot, '.dev/verification-billing-postgres')
    const metadataPath = resolve(directory, 'stack.json')
    mkdirSync(directory, { recursive: true, mode: 0o700 })

    const metadata = existsSync(metadataPath)
        ? validateVerificationBillingMetadata(JSON.parse(readFileSync(metadataPath, 'utf8')) as unknown, checkoutRoot)
        : undefined
    const existingIds = command(
        'docker',
        ['ps', '-aq', '--filter', `label=com.docker.compose.project=${projectName}`],
        checkoutRoot,
    )
        .split('\n')
        .filter(Boolean)
    if (existingIds.length > 1 || (existingIds.length > 0 && !metadata)) {
        throw new Error(
            'Unexpected verification-billing Compose resources or missing ownership metadata; no resources changed',
        )
    }
    const inspect = (id: string): void => {
        const parsed: unknown = JSON.parse(
            command('docker', ['inspect', '--format', '{{json .Config.Labels}}', id], checkoutRoot),
        )
        assertVerificationBillingContainer(z.record(z.string(), z.string()).parse(parsed), checkoutRoot, composeFile)
    }
    existingIds.forEach(inspect)
    const password = metadata
        ? decodeURIComponent(new URL(metadata.TEST_VERIFICATION_BILLING_POSTGRES_URL).password)
        : randomBytes(32).toString('hex')
    const env = { ...process.env, VERIFICATION_BILLING_TEST_PASSWORD: password }
    const composeArgs = ['compose', '--project-directory', checkoutRoot, '-p', projectName, '-f', composeFile]
    // Preserve the password across interrupted startup, allowing a retry of the same owned stack.
    if (!metadata) {
        const pending = {
            checkoutRoot,
            projectName,
            composeFile,
            TEST_VERIFICATION_BILLING_POSTGRES_URL: `postgresql://postgres:${password}@127.0.0.1:1/verification_billing_test`,
        }
        writeFileSync(metadataPath, `${JSON.stringify(pending, null, 2)}\n`, { mode: 0o600 })
    }
    command('docker', [...composeArgs, 'up', '-d', '--wait', '--wait-timeout', '90'], checkoutRoot, env)
    const id = command('docker', [...composeArgs, 'ps', '-q', 'verification-billing-postgres'], checkoutRoot, env)
    inspect(id)
    const binding = command('docker', [...composeArgs, 'port', 'verification-billing-postgres', '5432'], checkoutRoot, env)
    if (!/^127\.0\.0\.1:\d+$/.test(binding))
        throw new Error('Verification-billing PostgreSQL must expose only a loopback port')
    const connectionUrl = `postgresql://postgres:${encodeURIComponent(password)}@${binding}/verification_billing_test`
    const current = validateVerificationBillingMetadata(
        { checkoutRoot, projectName, composeFile, TEST_VERIFICATION_BILLING_POSTGRES_URL: connectionUrl },
        checkoutRoot,
    )
    writeFileSync(metadataPath, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 })

    // Load the validated ignored metadata, never a caller's TEST_VERIFICATION_BILLING_POSTGRES_URL override.
    const loaded = validateVerificationBillingMetadata(
        JSON.parse(readFileSync(metadataPath, 'utf8')) as unknown,
        checkoutRoot,
    )
    const reportPath = resolve(directory, 'jest-results.json')
    rmSync(reportPath, { force: true })
    const result = spawnSync(
        'corepack',
        [
            'pnpm',
            'exec',
            'jest',
            'verification-billing.integration.spec.ts',
            '--runInBand',
            '--json',
            `--outputFile=${reportPath}`,
        ],
        {
            cwd: checkoutRoot,
            env: {
                ...process.env,
                TEST_VERIFICATION_BILLING_POSTGRES_URL: loaded.TEST_VERIFICATION_BILLING_POSTGRES_URL,
            },
            encoding: 'utf8',
            timeout: 180_000,
            maxBuffer: 10 * 1024 * 1024,
        },
    )
    if (result.error || result.status !== 0)
        throw new Error('Verification-billing PostgreSQL tests failed; inspect the ignored Jest report locally')
    const count = passedVerificationBillingTests(JSON.parse(readFileSync(reportPath, 'utf8')) as unknown)
    process.stdout.write(`Verification-billing PostgreSQL: ${count} tests passed; zero skipped.\n`)
}

if (require.main === module) {
    try {
        runVerificationBillingPostgres()
    } catch (error) {
        // Validation messages are controlled; unexpected exceptions are never printed with sensitive payloads.
        const safe =
            error instanceof Error &&
            /^(Verification-billing |Invalid |Refusing |Unexpected |docker failed|corepack failed)/.test(
                error.message,
            )
        process.stderr.write(`${safe ? error.message : 'Verification-billing PostgreSQL validation failed'}\n`)
        process.exitCode = 1
    }
}
