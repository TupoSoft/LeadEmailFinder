import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function runDevelopmentCommand(program, args, { cwd, env = process.env, input, timeout = 180_000 } = {}) {
    const result = spawnSync(program, args, { cwd, env, input, encoding: 'utf8', timeout, maxBuffer: 20 * 1024 * 1024 })
    if (result.error || result.status !== 0)
        throw new Error('Development command failed; child output withheld to protect credentials')
    return result.stdout.trim()
}

export function validateDevelopmentMetadata(value, checkoutRoot) {
    if (!value || value.checkoutRoot !== checkoutRoot || !/^[a-z0-9][a-z0-9_-]*$/.test(value.composeProject ?? '')) {
        throw new Error('Development stack metadata does not belong to this checkout')
    }
    for (const [key, protocols] of Object.entries({
        apiUrl: ['http:'],
        keycloakUrl: ['http:'],
        postgresUrl: ['postgresql:', 'postgres:'],
        redisUrl: ['redis:'],
    })) {
        let url
        try {
            url = new URL(value[key])
        } catch {
            throw new Error('Invalid development stack endpoint')
        }
        if (
            !protocols.includes(url.protocol) ||
            !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
            url.search ||
            url.hash ||
            !url.port ||
            (key !== 'postgresUrl' && (url.username || url.password))
        ) {
            throw new Error('Development stack endpoints must use explicit loopback ports')
        }
    }
    if (!value.keycloakAdminUsername?.trim() || !value.keycloakAdminPassword?.trim()) {
        throw new Error('Development stack admin configuration is missing')
    }
    return value
}

export function assertOwnedDevelopmentContainer(container, metadata, service, internalPort, endpoint) {
    const labels = container?.Config?.Labels ?? {}
    const directory = labels['com.docker.compose.project.working_dir']
    const files = (labels['com.docker.compose.project.config_files'] ?? '').split(',')
    if (
        !container?.State?.Running ||
        labels['com.docker.compose.project'] !== metadata.composeProject ||
        labels['com.docker.compose.service'] !== service ||
        !directory ||
        ![metadata.checkoutRoot, resolve(metadata.checkoutRoot, 'docker')].includes(resolve(directory)) ||
        !files.includes(resolve(metadata.checkoutRoot, 'docker/compose.yaml')) ||
        files.some(
            file =>
                ![
                    resolve(metadata.checkoutRoot, 'docker/compose.yaml'),
                    resolve(metadata.checkoutRoot, 'docker/compose.smtp-dev.yaml'),
                ].includes(file),
        )
    ) {
        throw new Error('Development service is not owned by this checkout and Compose project')
    }
    if (
        service === 'api' &&
        !container.Mounts?.some(
            mount => mount.Type === 'bind' && mount.Source === metadata.checkoutRoot && mount.Destination === '/app',
        )
    ) {
        throw new Error('Development API must mount this checkout at /app')
    }
    if (endpoint && internalPort) {
        const url = new URL(endpoint)
        const permitted = url.hostname === '[::1]' ? ['::', '::1'] : ['0.0.0.0', '127.0.0.1']
        if (
            !container.NetworkSettings?.Ports?.[internalPort]?.some(
                binding => binding.HostPort === url.port && permitted.includes(binding.HostIp),
            )
        ) {
            throw new Error('Development endpoint does not match its confirmed container port')
        }
    }
}

export function inspectDevelopmentService(checkoutRoot, metadata, service, internalPort, endpoint) {
    const id = runDevelopmentCommand(
        'docker',
        [
            'ps',
            '--no-trunc',
            '--quiet',
            '--filter',
            `label=com.docker.compose.project=${metadata.composeProject}`,
            '--filter',
            `label=com.docker.compose.service=${service}`,
        ],
        { cwd: checkoutRoot },
    )
    if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Expected exactly one running development service container')
    const inspected = JSON.parse(runDevelopmentCommand('docker', ['inspect', id], { cwd: checkoutRoot }))
    if (!Array.isArray(inspected) || inspected.length !== 1) throw new Error('Invalid development service inspection')
    const container = inspected[0]
    assertOwnedDevelopmentContainer(container, metadata, service, internalPort, endpoint)
    return { id, container }
}

function publishedEndpoint(container, internalPort, protocol) {
    const binding = container.NetworkSettings?.Ports?.[internalPort]?.find(entry =>
        ['0.0.0.0', '127.0.0.1'].includes(entry.HostIp),
    )
    if (!binding || !/^\d+$/.test(binding.HostPort))
        throw new Error('Development service requires a published loopback-accessible port')
    return `${protocol}://localhost:${binding.HostPort}`
}

// Refresh credentials and ownership on every invocation. The generated file is convenient provenance, not
// permission to mutate resources: no cached ownership claim substitutes for current Docker labels.
export function loadDevelopmentStack(checkoutRoot) {
    const metadataPath = resolve(checkoutRoot, '.dev/keycloak/development-stack.json')
    const previous = existsSync(metadataPath)
        ? validateDevelopmentMetadata(JSON.parse(readFileSync(metadataPath, 'utf8')), checkoutRoot)
        : undefined
    const composeProject = process.env.COMPOSE_PROJECT_NAME ?? previous?.composeProject ?? 'lef'
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(composeProject)) throw new Error('Invalid development Compose project')
    const ownership = { checkoutRoot, composeProject }
    const services = Object.fromEntries(
        ['api', 'web', 'postgres', 'redis', 'keycloak'].map(service => [
            service,
            inspectDevelopmentService(checkoutRoot, ownership, service),
        ]),
    )
    const postgres = services.postgres.container
    const postgresEnvironment = Object.fromEntries(
        (postgres.Config.Env ?? []).map(value => [
            value.slice(0, value.indexOf('=')),
            value.slice(value.indexOf('=') + 1),
        ]),
    )
    const passwordMount = postgres.Mounts?.find(
        mount => mount.Destination === '/run/secrets/postgres_password' && mount.Type === 'bind',
    )
    const expectedSecret = resolve(checkoutRoot, 'docker/secrets/postgres_password.txt')
    if (
        postgresEnvironment.POSTGRES_USER !== 'postgres' ||
        postgresEnvironment.POSTGRES_DB !== 'lef' ||
        !passwordMount ||
        realpathSync(passwordMount.Source) !== realpathSync(expectedSecret)
    ) {
        throw new Error('Development PostgreSQL does not use this checkout disposable configuration')
    }
    const password = readFileSync(expectedSecret, 'utf8').trim()
    if (!password) throw new Error('Development PostgreSQL password is missing')
    const adminEnvironment = Object.fromEntries(
        (services.keycloak.container.Config.Env ?? []).map(value => [
            value.slice(0, value.indexOf('=')),
            value.slice(value.indexOf('=') + 1),
        ]),
    )
    const postgresUrl = new URL(publishedEndpoint(postgres, '5432/tcp', 'postgresql'))
    postgresUrl.username = 'postgres'
    postgresUrl.password = password
    postgresUrl.pathname = '/lef'
    const metadata = validateDevelopmentMetadata(
        {
            ...ownership,
            apiUrl: publishedEndpoint(services.web.container, '8080/tcp', 'http'),
            postgresUrl: postgresUrl.toString(),
            redisUrl: publishedEndpoint(services.redis.container, '6379/tcp', 'redis'),
            keycloakUrl: publishedEndpoint(services.keycloak.container, '8080/tcp', 'http'),
            keycloakAdminUsername: adminEnvironment.KC_BOOTSTRAP_ADMIN_USERNAME,
            keycloakAdminPassword: adminEnvironment.KC_BOOTSTRAP_ADMIN_PASSWORD,
        },
        checkoutRoot,
    )
    mkdirSync(resolve(checkoutRoot, '.dev/keycloak'), { recursive: true, mode: 0o700 })
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 })
    chmodSync(metadataPath, 0o600)
    return metadata
}
