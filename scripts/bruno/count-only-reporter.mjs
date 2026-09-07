// Loaded before the pinned CLI. Invitation URLs and assertion values must never
// reach a reporter file or terminal, including when the CLI exits unsuccessfully.
import fs from 'node:fs'
import path from 'node:path'

const reportPath = process.env.LEF_BRUNO_COUNTS_REPORT
if (!reportPath || !path.isAbsolute(reportPath)) process.exit(1)

const discard = (_chunk, encoding, callback) => {
    if (typeof encoding === 'function') encoding()
    else if (typeof callback === 'function') callback()
    return true
}
process.stdout.write = discard
process.stderr.write = discard
// Node's default uncaught-error handler writes directly to stderr.
process.on('uncaughtException', () => process.exit(1))
process.on('unhandledRejection', () => process.exit(1))

const write = fs.writeFileSync.bind(fs)
fs.writeFileSync = (file, data, options) => {
    if (file !== reportPath) return write(file, data, options)
    const report = JSON.parse(String(data))
    const summaryFields = [
        'totalRequests', 'passedRequests', 'failedRequests', 'errorRequests', 'skippedRequests',
        'totalTests', 'passedTests', 'failedTests', 'failedAssertions',
    ]
    const safe = report.map(iteration => ({
        skipped: Boolean(iteration.skipped),
        summary: Object.fromEntries(summaryFields.map(field => [
            field, typeof iteration.summary?.[field] === 'number' ? iteration.summary[field] : null,
        ])),
        results: (iteration.results ?? []).map(result => ({
            skipped: Boolean(result.skipped),
            error: Boolean(result.error),
            testResults: (result.testResults ?? []).map(test => ({
                status: test.status === 'pass' ? 'pass' : 'fail',
            })),
        })),
    }))
    return write(file, JSON.stringify(safe), options)
}
