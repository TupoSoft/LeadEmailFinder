import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { passedBffTests, validateBffInputs } from './bff-live.mjs'

let directory
try {
    const inputs = validateBffInputs(JSON.parse(readFileSync(0, 'utf8')))
    directory = mkdtempSync(resolve(tmpdir(), 'lef-bff-live-'))
    const reportFile = resolve(directory, 'jest-results.json')
    const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('TEST_BFF_') && !key.startsWith('OIDC_')),
    )
    const result = spawnSync(
        process.execPath,
        [
            'node_modules/jest/bin/jest.js',
            'src/libs/modules/bff-session/src/bff-session-flow.live-keycloak.integration.spec.ts',
            '--runInBand',
            '--json',
            `--outputFile=${reportFile}`,
        ],
        { cwd: '/app', env: { ...env, ...inputs }, encoding: 'utf8', timeout: 240_000, maxBuffer: 20 * 1024 * 1024 },
    )
    if (result.error || result.status !== 0) throw new Error('BFF live Jest execution failed')
    const report = JSON.parse(readFileSync(reportFile, 'utf8'))
    passedBffTests(report)
    const fields = [
        'success',
        'numPassedTests',
        'numTotalTests',
        'numPendingTests',
        'numFailedTests',
        'numFailedTestSuites',
        'numPendingTestSuites',
        'numPassedTestSuites',
        'numTotalTestSuites',
    ]
    process.stdout.write(JSON.stringify(Object.fromEntries(fields.map(field => [field, report[field]]))))
} catch {
    process.stderr.write('BFF live execution failed; raw test output withheld to protect credentials.\n')
    process.exitCode = 1
} finally {
    if (directory) rmSync(directory, { recursive: true, force: true })
}
