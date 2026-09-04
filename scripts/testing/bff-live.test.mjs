import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildBffInputs, passedBffTests, REQUIRED_BFF_INPUTS, validateBffInputs } from './bff-live.mjs'
import { assertOwnedDevelopmentContainer, validateDevelopmentMetadata } from './development-stack.mjs'

const metadata = {
    checkoutRoot: '/synthetic/checkout',
    composeProject: 'lef-checkout',
    apiUrl: 'http://localhost:53000',
    postgresUrl: 'postgresql://postgres:synthetic-secret@localhost:55432/lef',
    redisUrl: 'redis://localhost:56379',
    keycloakUrl: 'http://localhost:58080',
    keycloakAdminUsername: 'admin',
    keycloakAdminPassword: 'synthetic-secret',
}
const credentials = {
    issuer: 'http://localhost:58080/realms/lead-email-finder',
    clientId: 'lef-web-bff',
    clientSecret: 'synthetic-secret',
}

test('builds every BFF prerequisite from confirmed metadata and keeps identity separate from transport', () => {
    const inputs = buildBffInputs(metadata, credentials)
    assert.equal(REQUIRED_BFF_INPUTS.length, 7)
    for (const key of REQUIRED_BFF_INPUTS) assert.ok(inputs[key])
    assert.equal(inputs.TEST_BFF_ISSUER_URL, credentials.issuer)
    assert.equal(inputs.TEST_BFF_BACKCHANNEL_URL, 'http://keycloak:8080/realms/lead-email-finder')
    assert.equal(inputs.TEST_BFF_JWKS_URI, `${inputs.TEST_BFF_BACKCHANNEL_URL}/protocol/openid-connect/certs`)
    assert.equal(new URL(inputs.TEST_BFF_POSTGRES_URL).pathname, '/bff_session_test')
    assert.equal(inputs.TEST_BFF_EXPECT_PUBLIC_UNREACHABLE, 'true')
    assert.equal(new URL(metadata.postgresUrl).pathname, '/lef')
})

test('refuses all seven missing prerequisites before a live suite could silently skip', () => {
    for (const key of REQUIRED_BFF_INPUTS) {
        for (const value of [undefined, '', '   ']) {
            assert.throws(
                () => validateBffInputs({ ...buildBffInputs(metadata, credentials), [key]: value }),
                new RegExp(key),
            )
        }
    }
})

test('refuses normal, alternate, remote, malformed and query-directed PostgreSQL targets without disclosing credentials', () => {
    for (const url of [
        'postgresql://postgres:synthetic-secret@postgres:5432/lef',
        'postgresql://postgres:synthetic-secret@postgres:5432/another_test',
        'postgresql://postgres:synthetic-secret@remote:5432/bff_session_test',
        'postgresql://postgres:synthetic-secret@postgres:5432/bff_session_test?host=remote',
        'postgresql://postgres:synthetic-secret@postgres:5432/bff_session_test#fragment',
        'malformed-synthetic-secret',
    ]) {
        assert.throws(
            () => validateBffInputs({ ...buildBffInputs(metadata, credentials), TEST_BFF_POSTGRES_URL: url }),
            error => {
                assert.ok(!error.message.includes('synthetic-secret'))
                return true
            },
        )
    }
})

test('rejects stale credentials and internal issuer identity', () => {
    assert.throws(() =>
        buildBffInputs(metadata, { ...credentials, issuer: 'http://keycloak:8080/realms/lead-email-finder' }),
    )
    assert.throws(() => buildBffInputs(metadata, { ...credentials, clientId: 'another-client' }))
    assert.throws(() =>
        validateBffInputs({
            ...buildBffInputs(metadata, credentials),
            TEST_BFF_ISSUER_URL: 'http://keycloak:8080/realms/lead-email-finder',
        }),
    )
    assert.throws(() =>
        validateBffInputs({
            ...buildBffInputs(metadata, credentials),
            TEST_BFF_JWKS_URI: `${credentials.issuer}/protocol/openid-connect/certs`,
        }),
    )
})

test('requires exactly one nonempty passing live suite and rejects skipped or failed execution', () => {
    const report = {
        success: true,
        numPassedTests: 4,
        numTotalTests: 4,
        numPendingTests: 0,
        numFailedTests: 0,
        numFailedTestSuites: 0,
        numPendingTestSuites: 0,
        numTotalTestSuites: 1,
        numPassedTestSuites: 1,
    }
    assert.equal(passedBffTests(report), 4)
    for (const change of [
        { success: false },
        { numPassedTests: 0, numTotalTests: 0 },
        { numPendingTests: 1 },
        { numFailedTests: 1 },
        { numFailedTestSuites: 1 },
        { numPendingTestSuites: 1 },
        { numPassedTests: 3 },
        { numTotalTestSuites: 0 },
        { numPassedTestSuites: 0 },
    ]) {
        assert.throws(() => passedBffTests({ ...report, ...change }))
    }
})

test('metadata rejects another checkout and nonlocal endpoint aliases', () => {
    assert.equal(validateDevelopmentMetadata(metadata, metadata.checkoutRoot), metadata)
    assert.throws(() => validateDevelopmentMetadata(metadata, '/another/checkout'))
    for (const key of ['apiUrl', 'postgresUrl', 'redisUrl', 'keycloakUrl']) {
        const url = new URL(metadata[key])
        url.hostname = 'remote'
        assert.throws(() => validateDevelopmentMetadata({ ...metadata, [key]: url.href }, metadata.checkoutRoot))
    }
})

function apiContainer() {
    return {
        Config: {
            Labels: {
                'com.docker.compose.project': metadata.composeProject,
                'com.docker.compose.project.working_dir': '/synthetic/checkout/docker',
                'com.docker.compose.project.config_files': '/synthetic/checkout/docker/compose.yaml',
                'com.docker.compose.service': 'api',
            },
        },
        State: { Running: true },
        Mounts: [{ Type: 'bind', Source: metadata.checkoutRoot, Destination: '/app' }],
        NetworkSettings: { Ports: { '3000/tcp': [{ HostIp: '0.0.0.0', HostPort: '53000' }] } },
    }
}

test('validates project, checkout, config files, running state, API mount and endpoint binding', () => {
    const check = container => assertOwnedDevelopmentContainer(container, metadata, 'api', '3000/tcp', metadata.apiUrl)
    check(apiContainer())
    for (const key of Object.keys(apiContainer().Config.Labels)) {
        const container = apiContainer()
        container.Config.Labels[key] = 'different'
        assert.throws(() => check(container))
    }
    for (const mutate of [
        container => {
            container.State.Running = false
        },
        container => {
            container.Mounts = []
        },
        container => {
            container.Mounts[0].Source = '/another/checkout'
        },
        container => {
            container.NetworkSettings.Ports['3000/tcp'][0].HostPort = '53001'
        },
        container => {
            container.NetworkSettings.Ports['3000/tcp'][0].HostIp = '192.0.2.1'
        },
    ]) {
        const container = apiContainer()
        mutate(container)
        assert.throws(() => check(container))
    }
})

test('accepts the current checkout SMTP overlay but refuses unrelated Compose files', () => {
    const container = apiContainer()
    container.Config.Labels['com.docker.compose.project.config_files'] +=
        ',/synthetic/checkout/docker/compose.smtp-dev.yaml'
    assert.doesNotThrow(() => assertOwnedDevelopmentContainer(container, metadata, 'api'))
    container.Config.Labels['com.docker.compose.project.config_files'] += ',/synthetic/checkout/docker/production.yaml'
    assert.throws(() => assertOwnedDevelopmentContainer(container, metadata, 'api'))
})
