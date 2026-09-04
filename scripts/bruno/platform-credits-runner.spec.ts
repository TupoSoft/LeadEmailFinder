import { assertExecutedBrunoReport, assertOwnedContainer, ComposeContainer, validateMetadata } from './platform-credits-runner'

const metadata = {
    checkoutRoot: '/checkout', composeProject: 'lef-test', apiUrl: 'http://localhost:53000',
    postgresUrl: 'postgresql://postgres:synthetic@localhost:55432/lef', keycloakUrl: 'http://localhost:58080',
    keycloakAdminUsername: 'admin', keycloakAdminPassword: 'synthetic',
}

function report(): unknown[] {
    return [{
        summary: { totalRequests: 1, passedRequests: 1, failedRequests: 0, errorRequests: 0,
            skippedRequests: 0, totalTests: 1, passedTests: 1, failedTests: 0, failedAssertions: 0 },
        results: [{ testResults: [{ status: 'pass' }] }],
    }]
}

describe('platform credit Bruno runner', () => {
    it('loads local metadata only for its own checkout', () => {
        expect(validateMetadata(metadata, '/checkout')).toEqual(metadata)
        expect(() => validateMetadata(metadata, '/other')).toThrow('checkout ownership')
        expect(() => validateMetadata({ ...metadata, apiUrl: 'https://production.example' }, '/checkout')).toThrow()
        expect(() => validateMetadata({ ...metadata, postgresUrl: 'postgres://host/shared' }, '/checkout')).toThrow()
        expect(() => validateMetadata({ ...metadata, postgresUrl: `${metadata.postgresUrl}?host=remote.example` }, '/checkout')).toThrow()
        expect(() => validateMetadata({ ...metadata, postgresUrl: `${metadata.postgresUrl}#fragment` }, '/checkout')).toThrow()
    })

    it('requires every registered request and a nonzero passing test count', () => {
        expect(assertExecutedBrunoReport(report(), 1)).toEqual({ requests: 1, tests: 1 })
        expect(() => assertExecutedBrunoReport([], 1)).toThrow()
        expect(() => assertExecutedBrunoReport(report(), 2)).toThrow()
        expect(() => assertExecutedBrunoReport([{ summary: { totalRequests: 0, totalTests: 0 }, results: [] }], 1)).toThrow()
    })

    it('rejects skipped, failed, and mismatched report counts', () => {
        const successful = report()[0] as { summary: Record<string, number>; results: unknown[] }
        for (const field of ['skippedRequests', 'failedRequests', 'errorRequests', 'failedTests', 'failedAssertions']) {
            expect(() => assertExecutedBrunoReport([{ ...successful, summary: { ...successful.summary, [field]: 1 } }], 1)).toThrow()
        }
        expect(() => assertExecutedBrunoReport([{ ...successful, skipped: true }], 1)).toThrow()
        expect(() => assertExecutedBrunoReport([{ ...successful, results: [{ skipped: true, testResults: [{ status: 'pass' }] }] }], 1)).toThrow()
        expect(() => assertExecutedBrunoReport([{ ...successful, results: [{ testResults: [{ status: 'fail' }] }] }], 1)).toThrow()
        expect(() => assertExecutedBrunoReport([{ ...successful, summary: { ...successful.summary, totalTests: 2, passedTests: 2 } }], 1)).toThrow()
    })

    it('confirms the container checkout, service, running state, and published endpoint', () => {
        const container: ComposeContainer = {
            Config: { Labels: { 'com.docker.compose.project': 'lef-test', 'com.docker.compose.service': 'api',
                'com.docker.compose.project.working_dir': '/checkout/docker' } },
            State: { Running: true }, NetworkSettings: { Ports: { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '53000' }] } },
        }
        const check = (value: ComposeContainer, root = '/checkout', endpoint = 'http://localhost:53000'): void =>
            assertOwnedContainer(value, root, 'lef-test', 'api', '3000/tcp', endpoint)
        expect(() => check(container)).not.toThrow()
        expect(() => check(container, '/other')).toThrow()
        expect(() => check(container, '/checkout', 'http://localhost:53001')).toThrow()
        expect(() => check({ ...container, State: { Running: false } })).toThrow()
        const withHostIp = (hostIp: string): ComposeContainer => ({ ...container,
            NetworkSettings: { Ports: { '3000/tcp': [{ HostIp: hostIp, HostPort: '53000' }] } } })
        expect(() => check(withHostIp('192.0.2.1'))).toThrow()
        expect(() => check(withHostIp('0.0.0.0'))).not.toThrow()
        expect(() => check(withHostIp('::1'), '/checkout', 'http://[::1]:53000')).not.toThrow()
        expect(() => check(withHostIp('::'), '/checkout', 'http://[::1]:53000')).not.toThrow()
        expect(() => check(withHostIp('::1'), '/checkout', 'http://127.0.0.1:53000')).toThrow()
        expect(() => check(withHostIp('127.0.0.1'), '/checkout', 'http://[::1]:53000')).toThrow()
    })
})
