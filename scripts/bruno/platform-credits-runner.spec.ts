import { assertExecutedBrunoReport, loadPlatformCreditsStack } from './platform-credits-runner'

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
    it('uses shared live stack discovery for this checkout without requiring or writing bespoke metadata', () => {
        const loadDevelopmentStack = jest.fn().mockReturnValue(metadata)
        expect(loadPlatformCreditsStack('/checkout', { loadDevelopmentStack })).toBe(metadata)
        expect(loadDevelopmentStack).toHaveBeenCalledWith('/checkout', { persistMetadata: false })
    })

    it('propagates shared ownership and discovery failures instead of trusting cached fixture endpoints', () => {
        const failure = new Error('Development service is not owned by this checkout and Compose project')
        const loadDevelopmentStack = jest.fn().mockImplementation(() => { throw failure })
        expect(() => loadPlatformCreditsStack('/checkout', { loadDevelopmentStack })).toThrow(failure)
        expect(loadDevelopmentStack).toHaveBeenCalledTimes(1)
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

})
