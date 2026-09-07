import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

export default class BrowserFixtureReporter implements Reporter {
    onTestEnd(test: TestCase, result: TestResult) {
        const label = test.title.includes('platformOperator') ? 'platformOperator' : 'owner'
        console.log(`${label}: ${result.status === 'passed' ? 'PASS' : 'FAIL'}`)
        if (result.status !== 'passed') this.onError()
    }

    onError() {
        console.error(
            'Browser fixture failed. Confirm stack ownership, run the documented disposable reset, then bootstrap again.',
        )
    }

    onStdOut() {
        /* Auth process output is never forwarded to reports. */
    }
    onStdErr() {
        /* Auth process output is never forwarded to reports. */
    }
}
