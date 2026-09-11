import { resolve } from 'node:path'
import {
    assertVerificationBillingContainer,
    passedVerificationBillingTests,
    validateVerificationBillingMetadata,
    verificationBillingProjectName,
} from './verification-billing-postgres'

const checkoutRoot = '/synthetic/checkout'
const composeFile = resolve(checkoutRoot, 'docker/compose.verification-billing-test.yaml')
const metadata = {
    checkoutRoot,
    composeFile,
    projectName: verificationBillingProjectName(checkoutRoot),
    TEST_VERIFICATION_BILLING_POSTGRES_URL: 'postgresql://postgres:synthetic@127.0.0.1:54321/verification_billing_test',
}

describe('verification-billing PostgreSQL runner boundaries', () => {
    it('accepts only the dedicated test database in this checkout metadata', () => {
        expect(validateVerificationBillingMetadata(metadata, checkoutRoot)).toEqual(metadata)
    })
    it.each([
        'postgresql://postgres:synthetic@127.0.0.1:54321/lef',
        'postgresql://postgres:synthetic@remote:54321/verification_billing_test',
        'postgresql://postgres:synthetic@127.0.0.1:54321/another_test',
        'postgresql://postgres:synthetic@127.0.0.1:54321/verification_billing_test?host=remote',
        'malformed',
    ])('rejects an unsafe connection without exposing it', connection => {
        expect(() =>
            validateVerificationBillingMetadata(
                { ...metadata, TEST_VERIFICATION_BILLING_POSTGRES_URL: connection },
                checkoutRoot,
            ),
        ).toThrow()
        try {
            validateVerificationBillingMetadata(
                { ...metadata, TEST_VERIFICATION_BILLING_POSTGRES_URL: connection },
                checkoutRoot,
            )
        } catch (error) {
            expect((error as Error).message).not.toContain('synthetic')
        }
    })
    it('refuses metadata from another checkout', () => {
        expect(() => validateVerificationBillingMetadata(metadata, '/another/checkout')).toThrow('does not belong')
    })
    it('checks Docker ownership labels before mutations', () => {
        const labels = {
            'com.docker.compose.project': metadata.projectName,
            'com.docker.compose.project.working_dir': checkoutRoot,
            'com.docker.compose.project.config_files': composeFile,
            'com.docker.compose.service': 'verification-billing-postgres',
        }
        expect(() => assertVerificationBillingContainer(labels, checkoutRoot, composeFile)).not.toThrow()
        for (const key of Object.keys(labels)) {
            expect(() =>
                assertVerificationBillingContainer({ ...labels, [key]: 'different' }, checkoutRoot, composeFile),
            ).toThrow('Refusing')
        }
    })
    it('requires nonzero tests and refuses skipped or failed execution', () => {
        const report = {
            success: true,
            numPassedTests: 5,
            numTotalTests: 5,
            numPendingTests: 0,
            numFailedTests: 0,
            numFailedTestSuites: 0,
            numPendingTestSuites: 0,
            testResults: [
                {
                    name: '/checkout/src/libs/modules/email-verification/src/infrastructure/persistence/verification-billing.integration.spec.ts',
                },
            ],
        }
        expect(passedVerificationBillingTests(report)).toBe(5)
        expect(() => passedVerificationBillingTests({ ...report, numPassedTests: 0, numTotalTests: 0 })).toThrow()
        expect(() => passedVerificationBillingTests({ ...report, numPendingTests: 1 })).toThrow()
        expect(() => passedVerificationBillingTests({ ...report, success: false })).toThrow()
        expect(() => passedVerificationBillingTests({ ...report, numPassedTests: 4 })).toThrow()
    })
    it('rejects a report missing the required suite', () => {
        const report = {
            success: true,
            numPassedTests: 3,
            numTotalTests: 3,
            numPendingTests: 0,
            numFailedTests: 0,
            numFailedTestSuites: 0,
            numPendingTestSuites: 0,
            testResults: [{ name: '/checkout/src/libs/modules/email-verification/src/unrelated.spec.ts' }],
        }
        expect(() => passedVerificationBillingTests(report)).toThrow('missing a required test suite')
        expect(() => passedVerificationBillingTests({ ...report, testResults: [] })).toThrow()
    })
})
