import { resolve } from 'node:path'
import {
    assertCreditsContainer,
    creditsProjectName,
    passedCreditsTests,
    validateCreditsMetadata,
} from './credits-postgres'

const checkoutRoot = '/synthetic/checkout'
const composeFile = resolve(checkoutRoot, 'docker/compose.credits-test.yaml')
const metadata = {
    checkoutRoot,
    composeFile,
    projectName: creditsProjectName(checkoutRoot),
    TEST_CREDITS_POSTGRES_URL: 'postgresql://postgres:synthetic@127.0.0.1:54321/credits_test',
}

describe('credits PostgreSQL runner boundaries', () => {
    it('accepts only the dedicated test database in this checkout metadata', () => {
        expect(validateCreditsMetadata(metadata, checkoutRoot)).toEqual(metadata)
    })
    it.each([
        'postgresql://postgres:synthetic@127.0.0.1:54321/lef',
        'postgresql://postgres:synthetic@remote:54321/credits_test',
        'postgresql://postgres:synthetic@127.0.0.1:54321/another_test',
        'postgresql://postgres:synthetic@127.0.0.1:54321/credits_test?host=remote',
        'malformed',
    ])('rejects an unsafe connection without exposing it', connection => {
        expect(() =>
            validateCreditsMetadata({ ...metadata, TEST_CREDITS_POSTGRES_URL: connection }, checkoutRoot),
        ).toThrow()
        try {
            validateCreditsMetadata({ ...metadata, TEST_CREDITS_POSTGRES_URL: connection }, checkoutRoot)
        } catch (error) {
            expect((error as Error).message).not.toContain('synthetic')
        }
    })
    it('refuses metadata from another checkout', () => {
        expect(() => validateCreditsMetadata(metadata, '/another/checkout')).toThrow('does not belong')
    })
    it('checks Docker ownership labels before mutations', () => {
        const labels = {
            'com.docker.compose.project': metadata.projectName,
            'com.docker.compose.project.working_dir': checkoutRoot,
            'com.docker.compose.project.config_files': composeFile,
            'com.docker.compose.service': 'credits-postgres',
        }
        expect(() => assertCreditsContainer(labels, checkoutRoot, composeFile)).not.toThrow()
        for (const key of Object.keys(labels)) {
            expect(() => assertCreditsContainer({ ...labels, [key]: 'different' }, checkoutRoot, composeFile)).toThrow(
                'Refusing',
            )
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
        }
        expect(passedCreditsTests(report)).toBe(5)
        expect(() => passedCreditsTests({ ...report, numPassedTests: 0, numTotalTests: 0 })).toThrow()
        expect(() => passedCreditsTests({ ...report, numPendingTests: 1 })).toThrow()
        expect(() => passedCreditsTests({ ...report, success: false })).toThrow()
        expect(() => passedCreditsTests({ ...report, numPassedTests: 4 })).toThrow()
    })
})
