import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileAuthTools } from '../better-auth/compile-auth-tools.mjs'
import { assertCheckoutPrivateFile } from './development-stack.mjs'

const METADATA = '.dev/auth-runtime/stack.json'
const REPORT = '.dev/auth-runtime/node-test.tap'
const SERVICES = ['auth-runtime-postgres', 'auth-mail']

// A report missing any of these means a required runtime behavior silently did not execute.
export const REQUIRED_AUTH_RUNTIME_TESTS = [
    'a compiled CommonJS process loads the pinned package and selected plugins',
    'TypeORM synchronization matches every installed core and TOTP table',
    'native operations create and read users, sessions, verifications, and TOTP enrollments',
    'a duplicate native email is rejected while provisioning reuses the existing identity',
    'repeat initialization keeps existing users and enrollments and creates no migration state',
    'a magic link reaches the authentication Mailpit service without logging secrets',
    'SMTP rejection and connection failure propagate as redacted delivery errors',
    'closing the runtime releases its PostgreSQL pool',
]

export function authRuntimeProjectName(checkoutRoot) {
    return `lef-auth-runtime-${createHash('sha256').update(checkoutRoot).digest('hex').slice(0, 12)}`
}

export function authRuntimeComposeFile(checkoutRoot) {
    return resolve(checkoutRoot, 'docker/compose.auth-runtime-test.yaml')
}

export function validateAuthRuntimeMetadata(value, checkoutRoot) {
    if (
        !value ||
        value.checkoutRoot !== checkoutRoot ||
        value.projectName !== authRuntimeProjectName(checkoutRoot) ||
        value.composeFile !== authRuntimeComposeFile(checkoutRoot) ||
        typeof value.password !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.password)
    ) {
        throw new Error('Authentication runtime metadata does not belong to this checkout')
    }
    return value
}

export function assertAuthRuntimeContainer(labels, checkoutRoot, service) {
    if (
        labels?.['com.docker.compose.project'] !== authRuntimeProjectName(checkoutRoot) ||
        labels['com.docker.compose.project.working_dir'] !== checkoutRoot ||
        labels['com.docker.compose.project.config_files'] !== authRuntimeComposeFile(checkoutRoot) ||
        labels['com.docker.compose.service'] !== service
    ) {
        throw new Error('Refusing a container not owned by this checkout and authentication runtime Compose file')
    }
}

export function loopbackBinding(output) {
    const match = /^127\.0\.0\.1:(\d+)$/.exec(output.trim())
    if (!match) throw new Error('Refusing an authentication runtime port that is not bound only to loopback')
    return Number(match[1])
}

/** Requires every named test to pass, and none to fail, skip, be marked todo, or be cancelled. */
export function passedAuthRuntimeTests(tap, required = REQUIRED_AUTH_RUNTIME_TESTS) {
    const count = name => {
        const match = new RegExp(`^# ${name} (\\d+)$`, 'm').exec(tap)
        return match ? Number(match[1]) : undefined
    }
    const tests = count('tests')
    const pass = count('pass')
    if (
        !tests ||
        pass !== tests ||
        count('fail') !== 0 ||
        count('skipped') !== 0 ||
        count('todo') !== 0 ||
        count('cancelled') !== 0
    ) {
        throw new Error('Authentication runtime suite failed, skipped tests, or executed zero tests')
    }
    const passed = new Set([...tap.matchAll(/^ok \d+ - (.+?)(?: # .*)?$/gm)].map(match => match[1]))
    if (/^not ok /m.test(tap) || required.some(name => !passed.has(name))) {
        throw new Error('Authentication runtime report is missing a required test')
    }
    return pass
}

function command(program, args, cwd, env = process.env) {
    const result = spawnSync(program, args, { cwd, env, encoding: 'utf8', timeout: 180_000, maxBuffer: 10 * 1024 * 1024 })
    // Child diagnostics can contain passwords or connection URLs; return only controlled messages.
    if (result.error || result.status !== 0) throw new Error(`${program} failed during authentication runtime validation`)
    return result.stdout.trim()
}

function writePrivate(file, contents) {
    writeFileSync(file, contents, { mode: 0o600 })
    chmodSync(file, 0o600)
}

export function runAuthRuntime({ down = false } = {}) {
    const checkoutRoot = realpathSync(resolve(import.meta.dirname, '../..'))
    const projectName = authRuntimeProjectName(checkoutRoot)
    const composeFile = authRuntimeComposeFile(checkoutRoot)
    const metadataPath = assertCheckoutPrivateFile(checkoutRoot, METADATA)
    const reportPath = assertCheckoutPrivateFile(checkoutRoot, REPORT)
    mkdirSync(resolve(checkoutRoot, '.dev/auth-runtime'), { recursive: true, mode: 0o700 })

    const metadata = existsSync(metadataPath)
        ? validateAuthRuntimeMetadata(JSON.parse(readFileSync(metadataPath, 'utf8')), checkoutRoot)
        : undefined
    const existingIds = command('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${projectName}`], checkoutRoot)
        .split('\n')
        .filter(Boolean)
    if (existingIds.length > SERVICES.length || (existingIds.length > 0 && !metadata)) {
        throw new Error('Unexpected authentication runtime Compose resources or missing ownership metadata; no resources changed')
    }
    const inspect = (id, service) => {
        const labels = JSON.parse(command('docker', ['inspect', '--format', '{{json .Config.Labels}}', id], checkoutRoot))
        assertAuthRuntimeContainer(labels, checkoutRoot, service ?? labels['com.docker.compose.service'])
        if (!SERVICES.includes(labels['com.docker.compose.service'])) throw new Error('Refusing an unexpected service')
    }
    existingIds.forEach(id => inspect(id))

    const password = metadata?.password ?? randomBytes(32).toString('hex')
    const env = { ...process.env, AUTH_RUNTIME_TEST_PASSWORD: password }
    const compose = ['compose', '--project-directory', checkoutRoot, '-p', projectName, '-f', composeFile]
    if (down) {
        if (existingIds.length > 0) command('docker', [...compose, 'down', '--volumes'], checkoutRoot, env)
        rmSync(metadataPath, { force: true })
        rmSync(reportPath, { force: true })
        process.stdout.write('Authentication runtime stack removed.\n')
        return 0
    }
    // Preserve the password across interrupted startup, allowing a retry of the same owned stack.
    if (!metadata) writePrivate(metadataPath, `${JSON.stringify({ checkoutRoot, projectName, composeFile, password }, null, 2)}\n`)

    command('docker', [...compose, 'up', '-d', '--wait', '--wait-timeout', '90'], checkoutRoot, env)
    for (const service of SERVICES) inspect(command('docker', [...compose, 'ps', '-q', service], checkoutRoot, env), service)
    const postgresPort = loopbackBinding(command('docker', [...compose, 'port', 'auth-runtime-postgres', '5432'], checkoutRoot, env))
    const mailHttpPort = loopbackBinding(command('docker', [...compose, 'port', 'auth-mail', '8025'], checkoutRoot, env))
    const mailSmtpPort = loopbackBinding(command('docker', [...compose, 'port', 'auth-mail', '1025'], checkoutRoot, env))

    const tools = compileAuthTools(checkoutRoot)
    rmSync(reportPath, { force: true })
    const result = spawnSync(
        process.execPath,
        ['--test', '--test-reporter=tap', `--test-reporter-destination=${reportPath}`, tools.entry('runtime-contract.test')],
        {
            cwd: checkoutRoot,
            env: {
                ...process.env,
                TEST_BETTER_AUTH_POSTGRES_URL: `postgresql://postgres:${password}@127.0.0.1:${postgresPort}/auth_runtime_test`,
                TEST_AUTH_MAIL_HTTP_URL: `http://127.0.0.1:${mailHttpPort}`,
                TEST_AUTH_MAIL_SMTP_PORT: String(mailSmtpPort),
            },
            encoding: 'utf8',
            timeout: 180_000,
            maxBuffer: 10 * 1024 * 1024,
        },
    )
    if (existsSync(reportPath)) chmodSync(reportPath, 0o600)
    if (result.error || result.status !== 0) {
        throw new Error(`Authentication runtime tests failed; inspect ${REPORT} locally`)
    }
    const count = passedAuthRuntimeTests(readFileSync(reportPath, 'utf8'))
    process.stdout.write(`Authentication runtime: ${count} tests passed; zero skipped.\n`)
    return count
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        const args = process.argv.slice(2)
        if (args.some(arg => arg !== '--down')) throw new Error('Invalid arguments: expected no arguments or --down')
        runAuthRuntime({ down: args.includes('--down') })
    } catch (error) {
        // Validation messages are controlled; unexpected exceptions are never printed with sensitive payloads.
        const safe =
            error instanceof Error &&
            /^(Authentication |Invalid |Refusing |Unexpected |Development stack metadata |docker failed)/.test(error.message)
        process.stderr.write(`${safe ? error.message : 'Authentication runtime validation failed'}\n`)
        process.exitCode = 1
    }
}
