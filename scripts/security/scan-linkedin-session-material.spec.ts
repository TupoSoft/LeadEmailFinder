import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
    LINKEDIN_SESSION_RULE_IDS,
    runLinkedInSessionScannerCli,
    type LinkedInSessionScanFinding,
} from './scan-linkedin-session-material'

interface Capture {
    readonly writer: { write(text: string): void }
    value(): string
}

interface SyntheticSessionMaterial {
    readonly cookieName: string
    readonly cookieValue: string
    readonly sessionName: string
    readonly sessionValue: string
    readonly csrfHeaderName: string
    readonly csrfValue: string
}

const fixtureRoots: string[] = []

function captureText(): Capture {
    let output = ''

    return {
        writer: {
            write(text: string): void {
                output += text
            },
        },
        value: () => output,
    }
}

function write(path: string, contents: string | Buffer): void {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, contents)
}

function git(root: string, args: readonly string[]): string {
    return execFileSync('git', [...args], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
}

function createRepository(): string {
    const root = mkdtempSync(join(tmpdir(), 'lef-linkedin-scanner-'))
    fixtureRoots.push(root)
    git(root, ['init', '--quiet'])
    git(root, ['config', 'user.email', 'scanner@example.invalid'])
    git(root, ['config', 'user.name', 'Scanner fixture'])
    return root
}

function commitAll(root: string, message: string): void {
    git(root, ['add', '--all'])
    git(root, ['commit', '--quiet', '--message', message])
}

function syntheticSessionMaterial(): SyntheticSessionMaterial {
    const csrfValue = [['a', 'jax'].join(''), ':', 'fixture-', '7'.repeat(24)].join('')

    return {
        cookieName: ['li', 'at'].join('_'),
        cookieValue: [['A', 'Q', 'E'].join(''), '-', 'fixture-', 'x'.repeat(48)].join(''),
        sessionName: ['JSESSION', 'ID'].join(''),
        sessionValue: csrfValue,
        csrfHeaderName: ['csrf', 'token'].join('-'),
        csrfValue,
    }
}

function textWithAllRules(material: SyntheticSessionMaterial): string {
    return [
        `Cookie: ${material.cookieName}=${material.cookieValue}`,
        `Cookie: ${material.sessionName}="${material.sessionValue}"`,
        `'${material.csrfHeaderName}': '${material.csrfValue}'`,
        '',
    ].join('\n')
}

function containsSyntheticValue(output: string, material: SyntheticSessionMaterial): boolean {
    return [material.cookieValue, material.sessionValue, material.csrfValue].some(value => output.includes(value))
}

function parseFindings(output: string): LinkedInSessionScanFinding[] {
    return JSON.parse(output) as LinkedInSessionScanFinding[]
}

async function runScanner(
    root: string,
    scope: 'working-tree' | 'reachable-history',
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
    const stdout = captureText()
    const stderr = captureText()
    const exitCode = await runLinkedInSessionScannerCli([`--scope=${scope}`], {
        cwd: root,
        stdout: stdout.writer,
        stderr: stderr.writer,
    })

    return { exitCode, stdout: stdout.value(), stderr: stderr.value() }
}

afterEach((): void => {
    for (const root of fixtureRoots.splice(0)) {
        rmSync(root, { recursive: true, force: true })
    }
})

describe('working-tree scan', (): void => {
    it('scans tracked and non-ignored untracked text while omitting ignored and binary content', async (): Promise<void> => {
        const root = createRepository()
        const material = syntheticSessionMaterial()
        write(join(root, '.gitignore'), 'ignored.txt\n')
        write(
            join(root, 'tracked.txt'),
            [
                `first=${material.cookieName}=${material.cookieValue}`,
                `second=${material.cookieName}=${material.cookieValue}`,
                '',
            ].join('\n'),
        )
        write(
            join(root, 'binary.bin'),
            Buffer.concat([Buffer.from(textWithAllRules(material), 'utf8'), Buffer.from([0, 1, 2])]),
        )
        write(join(root, 'ignored.txt'), textWithAllRules(material))
        commitAll(root, 'add tracked fixtures')
        write(
            join(root, 'untracked.txt'),
            [
                `Cookie: ${material.sessionName}="${material.sessionValue}"`,
                `'${material.csrfHeaderName}': '${material.csrfValue}'`,
                '',
            ].join('\n'),
        )

        const result = await runScanner(root, 'working-tree')

        expect(result.exitCode).toBe(1)
        expect(result.stderr).toBe('')
        expect(containsSyntheticValue(result.stdout, material)).toBe(false)

        const findings = parseFindings(result.stdout)
        expect(findings).toEqual([
            {
                scope: 'working-tree',
                ruleId: LINKEDIN_SESSION_RULE_IDS.longSessionCookie,
                path: 'tracked.txt',
                count: 2,
            },
            {
                scope: 'working-tree',
                ruleId: LINKEDIN_SESSION_RULE_IDS.csrfHeader,
                path: 'untracked.txt',
                count: 1,
            },
            {
                scope: 'working-tree',
                ruleId: LINKEDIN_SESSION_RULE_IDS.sessionCookie,
                path: 'untracked.txt',
                count: 1,
            },
        ])
        expect(findings.every(finding => Object.keys(finding).sort().join(',') === 'count,path,ruleId,scope')).toBe(
            true,
        )
    })

    it('returns a successful empty JSON report for a clean repository', async (): Promise<void> => {
        const root = createRepository()
        write(join(root, 'tracked.txt'), 'No session material here.\n')
        commitAll(root, 'add clean fixture')
        write(join(root, 'untracked.txt'), 'Still clean.\n')

        const result = await runScanner(root, 'working-tree')

        expect(result).toEqual({ exitCode: 0, stdout: '[]\n', stderr: '' })
    })
})

describe('reachable-history scan', (): void => {
    it('finds deleted text blobs through batched object reads and emits only redacted metadata', async (): Promise<void> => {
        const root = createRepository()
        const material = syntheticSessionMaterial()
        const historicalPath = 'retired/session.txt'
        write(join(root, historicalPath), textWithAllRules(material))
        write(
            join(root, 'retired/binary.bin'),
            Buffer.concat([Buffer.from(textWithAllRules(material), 'utf8'), Buffer.from([0])]),
        )
        commitAll(root, 'add historical fixtures')
        const historicalObjectId = git(root, ['rev-parse', `HEAD:${historicalPath}`])
        rmSync(join(root, 'retired'), { recursive: true, force: true })
        write(join(root, 'clean.txt'), 'The current tree is clean.\n')
        commitAll(root, 'remove historical fixtures')

        const workingTreeResult = await runScanner(root, 'working-tree')
        const firstHistoryResult = await runScanner(root, 'reachable-history')
        const secondHistoryResult = await runScanner(root, 'reachable-history')

        expect(workingTreeResult).toEqual({ exitCode: 0, stdout: '[]\n', stderr: '' })
        expect(firstHistoryResult.exitCode).toBe(1)
        expect(firstHistoryResult.stderr).toBe('')
        expect(containsSyntheticValue(firstHistoryResult.stdout, material)).toBe(false)
        expect(secondHistoryResult).toEqual(firstHistoryResult)

        const findings = parseFindings(firstHistoryResult.stdout)
        expect(findings).toEqual([
            {
                scope: 'reachable-history',
                ruleId: LINKEDIN_SESSION_RULE_IDS.csrfHeader,
                path: historicalPath,
                objectId: historicalObjectId,
                count: 1,
            },
            {
                scope: 'reachable-history',
                ruleId: LINKEDIN_SESSION_RULE_IDS.sessionCookie,
                path: historicalPath,
                objectId: historicalObjectId,
                count: 1,
            },
            {
                scope: 'reachable-history',
                ruleId: LINKEDIN_SESSION_RULE_IDS.longSessionCookie,
                path: historicalPath,
                objectId: historicalObjectId,
                count: 1,
            },
        ])
        expect(
            findings.every(finding => Object.keys(finding).sort().join(',') === 'count,objectId,path,ruleId,scope'),
        ).toBe(true)
    })
})

describe('CLI argument validation', (): void => {
    it('accepts the argument separator forwarded by pnpm', async (): Promise<void> => {
        const root = createRepository()
        write(join(root, 'tracked.txt'), 'No session material here.\n')
        commitAll(root, 'add clean fixture')
        const stdout = captureText()
        const stderr = captureText()

        const exitCode = await runLinkedInSessionScannerCli(['--', '--scope=working-tree'], {
            cwd: root,
            stdout: stdout.writer,
            stderr: stderr.writer,
        })

        expect(exitCode).toBe(0)
        expect(stdout.value()).toBe('[]\n')
        expect(stderr.value()).toBe('')
    })

    it.each([
        [[]],
        [['--scope', 'working-tree']],
        [['--scope=other']],
        [['--scope=working-tree', '--scope=reachable-history']],
    ])('rejects unsupported arguments: %j', async args => {
        const stdout = captureText()
        const stderr = captureText()

        const exitCode = await runLinkedInSessionScannerCli(args, {
            stdout: stdout.writer,
            stderr: stderr.writer,
        })

        expect(exitCode).toBe(2)
        expect(stdout.value()).toBe('')
        expect(stderr.value()).toBe(
            'Usage: scan-linkedin-session-material.ts --scope=working-tree|--scope=reachable-history\n',
        )
    })
})
