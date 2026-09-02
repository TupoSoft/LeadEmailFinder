import { spawn } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { TextDecoder } from 'node:util'

export const LINKEDIN_SESSION_RULE_IDS = {
    longSessionCookie: ['linkedin', 'li', 'at', 'cookie'].join('-'),
    sessionCookie: ['linkedin', 'jsessionid', 'cookie'].join('-'),
    csrfHeader: ['linkedin', 'csrf', 'header'].join('-'),
} as const

export type LinkedInSessionRuleId = (typeof LINKEDIN_SESSION_RULE_IDS)[keyof typeof LINKEDIN_SESSION_RULE_IDS]

export type LinkedInSessionScanScope = 'working-tree' | 'reachable-history'

export interface LinkedInSessionScanFinding {
    readonly scope: LinkedInSessionScanScope
    readonly ruleId: LinkedInSessionRuleId
    readonly path: string
    readonly objectId?: string
    readonly count: number
}

interface DetectionRule {
    readonly ruleId: LinkedInSessionRuleId
    readonly matcher: RegExp
}

interface BatchObjectState {
    readonly objectId: string
    readonly type: string
    readonly size: number
    remaining: number
    readonly chunks: Buffer[]
}

interface TextWriter {
    write(text: string): unknown
}

export interface LinkedInSessionScannerCliOptions {
    readonly cwd?: string
    readonly stdout?: TextWriter
    readonly stderr?: TextWriter
}

const CLI_USAGE = 'Usage: scan-linkedin-session-material.ts --scope=working-tree|--scope=reachable-history\n'
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

function escapeRegularExpression(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildDetectionRules(): readonly DetectionRule[] {
    const longCookieName = ['li', 'at'].join('_')
    const sessionCookieName = ['JSESSION', 'ID'].join('')
    const csrfHeaderName = ['csrf', 'token'].join('-')
    const linkedInCsrfPrefix = ['ajax', ':'].join('')
    const boundary = String.raw`(?:^|[^A-Za-z0-9_])`
    const optionalQuote = String.raw`(?:\\?["'])?`

    return [
        {
            ruleId: LINKEDIN_SESSION_RULE_IDS.longSessionCookie,
            matcher: new RegExp(
                `${boundary}${escapeRegularExpression(longCookieName)}\\s*=\\s*${optionalQuote}[^\\s;'"\\\\]{32,}`,
                'gim',
            ),
        },
        {
            ruleId: LINKEDIN_SESSION_RULE_IDS.sessionCookie,
            matcher: new RegExp(
                `${boundary}${escapeRegularExpression(sessionCookieName)}\\s*=\\s*${optionalQuote}[^\\s;'"\\\\]{8,}`,
                'gim',
            ),
        },
        {
            ruleId: LINKEDIN_SESSION_RULE_IDS.csrfHeader,
            matcher: new RegExp(
                `${boundary}${escapeRegularExpression(csrfHeaderName)}${optionalQuote}\\s*[:=]\\s*${optionalQuote}${escapeRegularExpression(linkedInCsrfPrefix)}[^\\s;'"\\\\]{6,}`,
                'gim',
            ),
        },
    ]
}

const DETECTION_RULES = buildDetectionRules()

function decodeText(bytes: Buffer): string | undefined {
    if (bytes.includes(0)) {
        return undefined
    }

    try {
        return utf8Decoder.decode(bytes)
    } catch {
        return undefined
    }
}

function countMatches(text: string, matcher: RegExp): number {
    matcher.lastIndex = 0
    let count = 0

    while (matcher.exec(text) !== null) {
        count += 1
    }

    return count
}

function findingsForText(
    scope: LinkedInSessionScanScope,
    path: string,
    bytes: Buffer,
    objectId?: string,
): LinkedInSessionScanFinding[] {
    const text = decodeText(bytes)

    if (text === undefined) {
        return []
    }

    return DETECTION_RULES.flatMap(rule => {
        const count = countMatches(text, rule.matcher)

        if (count === 0) {
            return []
        }

        const finding: LinkedInSessionScanFinding = {
            scope,
            ruleId: rule.ruleId,
            path,
            ...(objectId === undefined ? {} : { objectId }),
            count,
        }

        return [finding]
    })
}

function compareText(left: string, right: string): number {
    if (left < right) {
        return -1
    }

    return left > right ? 1 : 0
}

function sortFindings(findings: LinkedInSessionScanFinding[]): LinkedInSessionScanFinding[] {
    return findings.sort(
        (left, right) =>
            compareText(left.path, right.path) ||
            compareText(left.ruleId, right.ruleId) ||
            compareText(left.objectId ?? '', right.objectId ?? ''),
    )
}

function runGit(args: readonly string[], cwd: string): Promise<Buffer> {
    return new Promise((resolveResult, reject) => {
        const child = spawn('git', [...args], {
            cwd,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
        const chunks: Buffer[] = []
        let settled = false

        child.stdout.on('data', (chunk: Buffer) => {
            chunks.push(Buffer.from(chunk))
        })
        child.on('error', () => {
            if (!settled) {
                settled = true
                reject(new Error('Git could not start'))
            }
        })
        child.on('close', code => {
            if (settled) {
                return
            }

            settled = true
            if (code !== 0) {
                reject(new Error(`Git ${args[0] ?? 'command'} failed`))
                return
            }

            resolveResult(Buffer.concat(chunks))
        })
    })
}

async function repositoryRoot(cwd: string): Promise<string> {
    const output = await runGit(['rev-parse', '--show-toplevel'], cwd)
    const root = output.toString('utf8').replace(/\r?\n$/, '')

    if (root.length === 0) {
        throw new Error('Git repository root is unavailable')
    }

    return root
}

function splitNullTerminated(output: Buffer): string[] {
    return output
        .toString('utf8')
        .split('\0')
        .filter(entry => entry.length > 0)
}

async function scanWorkingTree(cwd: string): Promise<LinkedInSessionScanFinding[]> {
    const root = await repositoryRoot(cwd)
    const inventory = await runGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root)
    const paths = [...new Set(splitNullTerminated(inventory))].sort(compareText)
    const findings: LinkedInSessionScanFinding[] = []

    for (const path of paths) {
        const absolutePath = resolve(root, path)
        const isInsideRepository = absolutePath === root || absolutePath.startsWith(`${root}${sep}`)

        if (!isInsideRepository) {
            continue
        }

        try {
            if (!lstatSync(absolutePath).isFile()) {
                continue
            }

            findings.push(...findingsForText('working-tree', path, readFileSync(absolutePath)))
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code

            if (code !== 'ENOENT') {
                throw new Error('A working-tree file could not be inspected')
            }
        }
    }

    return sortFindings(findings)
}

function parseReachableObjectInventory(output: Buffer): {
    readonly objectIds: string[]
    readonly pathByObjectId: ReadonlyMap<string, string>
} {
    const objectIds: string[] = []
    const seenObjectIds = new Set<string>()
    const pathByObjectId = new Map<string, string>()
    let pendingPathObjectId: string | undefined

    for (const entry of splitNullTerminated(output)) {
        const combinedEntry = /^([0-9a-f]{40}|[0-9a-f]{64})(?: (.*))?$/.exec(entry)

        if (combinedEntry === null) {
            if (pendingPathObjectId !== undefined && !pathByObjectId.has(pendingPathObjectId)) {
                pathByObjectId.set(pendingPathObjectId, entry.startsWith('path=') ? entry.slice(5) : entry)
            }
            pendingPathObjectId = undefined
            continue
        }

        const objectId = combinedEntry[1]

        if (!seenObjectIds.has(objectId)) {
            seenObjectIds.add(objectId)
            objectIds.push(objectId)
        }

        if (combinedEntry[2] !== undefined && !pathByObjectId.has(objectId)) {
            pathByObjectId.set(objectId, combinedEntry[2])
            pendingPathObjectId = undefined
        } else {
            pendingPathObjectId = objectId
        }
    }

    return { objectIds, pathByObjectId }
}

function inspectBatchObjects(
    cwd: string,
    objectIds: readonly string[],
    inspect: (objectId: string, bytes: Buffer) => void,
): Promise<void> {
    if (objectIds.length === 0) {
        return Promise.resolve()
    }

    return new Promise((resolveResult, reject) => {
        const child = spawn('git', ['cat-file', '--batch'], {
            cwd,
            stdio: ['pipe', 'pipe', 'ignore'],
        })
        let pending = Buffer.alloc(0)
        let current: BatchObjectState | undefined
        let settled = false

        const fail = (): void => {
            if (settled) {
                return
            }

            settled = true
            child.kill()
            reject(new Error('Git object inspection failed'))
        }

        const parseAvailableOutput = (): void => {
            try {
                while (true) {
                    if (current === undefined) {
                        const headerEnd = pending.indexOf(10)

                        if (headerEnd === -1) {
                            return
                        }

                        const header = pending.subarray(0, headerEnd).toString('ascii')
                        pending = pending.subarray(headerEnd + 1)
                        const fields = header.split(' ')

                        if (fields.length === 2 && fields[1] === 'missing') {
                            continue
                        }

                        if (fields.length !== 3 || !/^[0-9a-f]+$/.test(fields[0])) {
                            fail()
                            return
                        }

                        const size = Number(fields[2])

                        if (!Number.isSafeInteger(size) || size < 0) {
                            fail()
                            return
                        }

                        current = {
                            objectId: fields[0],
                            type: fields[1],
                            size,
                            remaining: size,
                            chunks: [],
                        }
                    }

                    if (current.remaining > 0) {
                        if (pending.length === 0) {
                            return
                        }

                        const byteCount = Math.min(current.remaining, pending.length)
                        if (current.type === 'blob') {
                            current.chunks.push(Buffer.from(pending.subarray(0, byteCount)))
                        }
                        pending = pending.subarray(byteCount)
                        current.remaining -= byteCount

                        if (current.remaining > 0) {
                            return
                        }
                    }

                    if (pending.length === 0) {
                        return
                    }

                    if (pending[0] !== 10) {
                        fail()
                        return
                    }

                    pending = pending.subarray(1)
                    if (current.type === 'blob') {
                        inspect(current.objectId, Buffer.concat(current.chunks, current.size))
                    }
                    current = undefined
                }
            } catch {
                fail()
            }
        }

        child.stdout.on('data', (chunk: Buffer) => {
            pending = Buffer.concat([pending, chunk])
            parseAvailableOutput()
        })
        child.stdin.on('error', fail)
        child.on('error', fail)
        child.on('close', code => {
            if (settled) {
                return
            }

            parseAvailableOutput()
            if (settled) {
                return
            }

            if (code !== 0 || current !== undefined || pending.length !== 0) {
                fail()
                return
            }

            settled = true
            resolveResult()
        })

        child.stdin.end(`${objectIds.join('\n')}\n`)
    })
}

async function scanReachableHistory(cwd: string): Promise<LinkedInSessionScanFinding[]> {
    const root = await repositoryRoot(cwd)
    const inventoryOutput = await runGit(['rev-list', '--objects', '--all', '-z'], root)
    const { objectIds, pathByObjectId } = parseReachableObjectInventory(inventoryOutput)
    const findings: LinkedInSessionScanFinding[] = []

    await inspectBatchObjects(root, objectIds, (objectId, bytes) => {
        findings.push(
            ...findingsForText('reachable-history', pathByObjectId.get(objectId) ?? '<unresolved>', bytes, objectId),
        )
    })

    return sortFindings(findings)
}

export async function scanLinkedInSessionMaterial(
    scope: LinkedInSessionScanScope,
    cwd = process.cwd(),
): Promise<LinkedInSessionScanFinding[]> {
    return scope === 'working-tree' ? scanWorkingTree(cwd) : scanReachableHistory(cwd)
}

export function serializeLinkedInSessionFindings(findings: readonly LinkedInSessionScanFinding[]): string {
    return `${JSON.stringify(findings, null, 2)}\n`
}

function parseScope(args: readonly string[]): LinkedInSessionScanScope | undefined {
    const scopeArgs = args[0] === '--' ? args.slice(1) : args

    if (scopeArgs.length !== 1) {
        return undefined
    }

    if (scopeArgs[0] === '--scope=working-tree') {
        return 'working-tree'
    }

    return scopeArgs[0] === '--scope=reachable-history' ? 'reachable-history' : undefined
}

export async function runLinkedInSessionScannerCli(
    args: readonly string[],
    options: LinkedInSessionScannerCliOptions = {},
): Promise<number> {
    const stdout = options.stdout ?? process.stdout
    const stderr = options.stderr ?? process.stderr
    const scope = parseScope(args)

    if (scope === undefined) {
        stderr.write(CLI_USAGE)
        return 2
    }

    try {
        const findings = await scanLinkedInSessionMaterial(scope, options.cwd)
        stdout.write(serializeLinkedInSessionFindings(findings))
        return findings.length === 0 ? 0 : 1
    } catch {
        stderr.write('LinkedIn session-material scan failed.\n')
        return 2
    }
}

if (require.main === module) {
    void runLinkedInSessionScannerCli(process.argv.slice(2)).then(exitCode => {
        process.exitCode = exitCode
    })
}
