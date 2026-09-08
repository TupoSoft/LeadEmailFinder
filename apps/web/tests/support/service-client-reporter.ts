import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/** Errors, DOM, network responses, and worker output may contain a one-time secret. */
export default class ServiceClientReporter implements Reporter {
    onTestEnd(test: TestCase, result: TestResult) {
        console.log(
            `Service-client test at line ${test.location.line}: ${result.status === 'passed' ? 'PASS' : 'FAIL'}`,
        )
        if (result.status !== 'passed') {
            const location = result.error?.stack?.match(/service-clients(?:-ui)?\.spec\.ts:\d+:\d+/)?.[0]
            if (location) console.error(location)
        }
    }
    onError() {
        console.error('Service-client browser validation failed. Check the owned stack and test configuration.')
    }
    onStdOut() {
        /* Never forward worker output. */
    }
    onStdErr() {
        /* Never forward worker output. */
    }
}
