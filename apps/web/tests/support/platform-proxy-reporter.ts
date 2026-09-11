import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/** Errors, DOM, network responses, and worker output may contain proxy credentials. */
export default class PlatformProxyReporter implements Reporter {
    onTestEnd(test: TestCase, result: TestResult) {
        console.log(
            `Platform-proxy test at line ${test.location.line}: ${result.status === 'passed' ? 'PASS' : 'FAIL'}`,
        )
        if (result.status !== 'passed') {
            const location = result.error?.stack?.match(/platform-proxies(?:-ui)?\.spec\.ts:\d+:\d+/)?.[0]
            if (location) console.error(location)
        }
    }
    onError() {
        console.error('Platform-proxy browser validation failed. Check the owned stack and test configuration.')
    }
    onStdOut() {
        /* Never forward worker output. */
    }
    onStdErr() {
        /* Never forward worker output. */
    }
}
