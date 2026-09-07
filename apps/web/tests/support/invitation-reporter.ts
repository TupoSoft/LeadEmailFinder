import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/** Invitation assertions may contain bearer URLs; never forward errors or attachments. */
export default class InvitationReporter implements Reporter {
    onTestEnd(test: TestCase, result: TestResult) {
        console.log(`Invitation test at line ${test.location.line}: ${result.status === 'passed' ? 'PASS' : 'FAIL'}`)
        if (result.status !== 'passed') {
            // Only source coordinates help locate a failing assertion. No error text is printed.
            const location = result.error?.stack?.match(
                /(?:invitations-ui|team-and-invitations)\.spec\.ts:\d+:\d+/,
            )?.[0]
            if (location) console.error(location)
            for (const error of result.errors) {
                if (error.location && /(?:invitations-ui|team-and-invitations)\.spec\.ts$/.test(error.location.file)) {
                    console.error(`Assertion at line ${error.location.line}`)
                }
            }
        }
    }
    onError() {
        console.error('Invitation browser validation failed. Check the owned stack and test configuration.')
    }
    onStdOut() {
        /* No browser or worker output. */
    }
    onStdErr() {
        /* No browser or worker output. */
    }
}
