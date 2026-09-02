import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import {
    ACCOUNT_DISCOVERY_APPROVALS_PATH,
    ACCOUNT_DISCOVERY_APPROVALS_RELATIVE_PATH,
    checkAccountDiscoveryApprovals,
} from '@tuposoft/lead-email-finder/config'

export * from '@tuposoft/lead-email-finder/config'

function readGitManifest(revision: string): string | null {
    const result = spawnSync('git', ['show', `${revision}:${ACCOUNT_DISCOVERY_APPROVALS_RELATIVE_PATH}`], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    })

    return result.status === 0 ? result.stdout : null
}

function readPreviousManifestSource(currentSource: string): string | null {
    const configuredBaseRevision = process.env['ACCOUNT_DISCOVERY_APPROVALS_BASE_SHA']?.trim()

    if (configuredBaseRevision) {
        return readGitManifest(configuredBaseRevision)
    }

    const headSource = readGitManifest('HEAD')

    if (headSource !== null && headSource !== currentSource) {
        return headSource
    }

    return readGitManifest('HEAD^')
}

export async function runAccountDiscoveryApprovalsCheck(
    stdout: NodeJS.WritableStream = process.stdout,
    stderr: NodeJS.WritableStream = process.stderr,
): Promise<number> {
    if (process.argv.slice(2).length > 0) {
        stderr.write('Usage: privacy:account-discovery-approvals-check\n')
        return 1
    }

    try {
        const source = await readFile(ACCOUNT_DISCOVERY_APPROVALS_PATH, 'utf8')
        const manifest = checkAccountDiscoveryApprovals(source, {
            previousSource: readPreviousManifestSource(source),
            requireRevisionBaseline: true,
        })

        stdout.write(
            `${JSON.stringify({
                path: ACCOUNT_DISCOVERY_APPROVALS_RELATIVE_PATH,
                schemaVersion: manifest.schemaVersion,
                revision: manifest.revision,
                approvalCount: manifest.approvals.length,
            })}\n`,
        )
        return 0
    } catch (error) {
        stderr.write(`${error instanceof Error ? error.message : 'Account-discovery approval validation failed'}\n`)
        return 1
    }
}

if (require.main === module) {
    void runAccountDiscoveryApprovalsCheck().then(exitCode => {
        process.exitCode = exitCode
    })
}
