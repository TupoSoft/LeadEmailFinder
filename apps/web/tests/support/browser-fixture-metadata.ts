import { randomUUID } from 'node:crypto'
import { constants, promises as fs } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'
import {
    BROWSER_FIXTURE_IDENTITIES,
    DEVELOPMENT_BROWSER_ISSUER,
    generateBrowserFixtureResetId,
    type BrowserSeedMetadata,
} from '../../../../scripts/keycloak/browser-fixture-identities.ts'
import { assertTotpSecret } from './totp.ts'

export type { BrowserSeedMetadata }
export type BrowserFixtureIdentity = 'owner' | 'platformOperator'

export interface BrowserFixtureMetadata {
    version: 1
    resetId: string
    users: Record<BrowserFixtureIdentity, { email: string; subject: string; totpSecret: string }>
}

const identities: BrowserFixtureIdentity[] = ['owner', 'platformOperator']
const maximumBytes = 16_384
const missingFile = Symbol('missing browser fixture file')
const resetGuidance =
    'Browser fixture authentication failed. Confirm that this checkout owns the disposable development stack, then run corepack pnpm dev:reset -- --confirm-project=LEF and corepack pnpm --filter ./apps/web browser-fixtures:bootstrap.'

export function browserFixtureError(): Error {
    return new Error(resetGuidance)
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
    if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        Object.keys(value).length !== keys.length ||
        keys.some(key => !Object.hasOwn(value, key))
    ) {
        throw browserFixtureError()
    }
    return value as Record<string, unknown>
}

function subject(value: unknown): asserts value is string {
    if (
        typeof value !== 'string' ||
        value.length !== 36 ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
    ) {
        throw browserFixtureError()
    }
}

function developmentIssuer(value: unknown): asserts value is string {
    if (typeof value !== 'string') throw browserFixtureError()
    const url = new URL(value)
    if (
        url.protocol !== 'http:' ||
        url.hostname !== 'localhost' ||
        !url.port ||
        Number(url.port) === 0 ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== '/realms/lead-email-finder' ||
        url.href !== value
    ) {
        throw browserFixtureError()
    }
}

export function validateBrowserSeedMetadata(
    value: unknown,
    expectedIssuer: string = DEVELOPMENT_BROWSER_ISSUER,
): BrowserSeedMetadata {
    try {
        developmentIssuer(expectedIssuer)
        const seed = object(value, ['version', 'issuer', 'resetId', 'users'])
        if (seed.version !== 1 || seed.issuer !== expectedIssuer) throw browserFixtureError()
        const users = object(seed.users, identities)
        for (const identity of identities) {
            const user = object(users[identity], ['email', 'subject', 'role'])
            if (
                user.email !== BROWSER_FIXTURE_IDENTITIES[identity].email ||
                user.role !== BROWSER_FIXTURE_IDENTITIES[identity].role
            )
                throw browserFixtureError()
            subject(user.subject)
        }
        const parsed = value as BrowserSeedMetadata
        if (
            parsed.users.owner.subject === parsed.users.platformOperator.subject ||
            parsed.resetId !==
                generateBrowserFixtureResetId(parsed.issuer, {
                    owner: parsed.users.owner.subject,
                    platformOperator: parsed.users.platformOperator.subject,
                })
        )
            throw browserFixtureError()
        return parsed
    } catch {
        throw browserFixtureError()
    }
}

export function validateBrowserFixtureMetadata(value: unknown, expected: BrowserSeedMetadata): BrowserFixtureMetadata {
    try {
        validateBrowserSeedMetadata(expected, expected.issuer)
        const metadata = object(value, ['version', 'resetId', 'users'])
        if (metadata.version !== 1 || metadata.resetId !== expected.resetId) throw browserFixtureError()
        const users = object(metadata.users, identities)
        for (const identity of identities) {
            const user = object(users[identity], ['email', 'subject', 'totpSecret'])
            if (user.email !== expected.users[identity].email || user.subject !== expected.users[identity].subject)
                throw browserFixtureError()
            assertTotpSecret(user.totpSecret)
        }
        return value as BrowserFixtureMetadata
    } catch {
        throw browserFixtureError()
    }
}

function isMissing(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

async function checkedDirectory(path: string): Promise<void> {
    const info = await fs.lstat(path)
    if (info.isSymbolicLink() || !info.isDirectory() || (await fs.realpath(path)) !== path) {
        throw browserFixtureError()
    }
}

async function metadataDirectory(repositoryRoot: string): Promise<string> {
    const root = resolve(repositoryRoot)
    if (root === parse(root).root) throw browserFixtureError()
    const ancestors: string[] = []
    for (let current = root; current !== parse(current).root; current = dirname(current)) ancestors.unshift(current)
    for (const ancestor of ancestors) await checkedDirectory(ancestor)
    const directory = join(root, '.dev', 'keycloak')
    await checkedDirectory(join(root, '.dev'))
    await checkedDirectory(directory)
    return directory
}

async function checkedFile(path: string, allowMissing: boolean): Promise<boolean> {
    try {
        const info = await fs.lstat(path)
        if (info.isSymbolicLink() || !info.isFile() || (info.mode & 0o777) !== 0o600 || info.nlink !== 1) {
            throw browserFixtureError()
        }
        return true
    } catch (error) {
        if (allowMissing && isMissing(error)) return false
        throw browserFixtureError()
    }
}

async function readJson(repositoryRoot: string, name: string, allowMissing: boolean): Promise<unknown> {
    let handle: FileHandle | undefined
    try {
        const directory = await metadataDirectory(repositoryRoot)
        const path = join(directory, name)
        if (!(await checkedFile(path, allowMissing))) return missingFile
        handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
        const info = await handle.stat()
        if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600 || info.size > maximumBytes) {
            throw browserFixtureError()
        }
        const content = await handle.readFile({ encoding: 'utf8' })
        if (Buffer.byteLength(content) > maximumBytes) throw browserFixtureError()
        await metadataDirectory(repositoryRoot)
        return JSON.parse(content) as unknown
    } catch {
        throw browserFixtureError()
    } finally {
        await handle?.close().catch(() => undefined)
    }
}

export async function readBrowserSeedMetadata(
    repositoryRoot: string,
    expectedIssuer: string = DEVELOPMENT_BROWSER_ISSUER,
): Promise<BrowserSeedMetadata> {
    return validateBrowserSeedMetadata(await readJson(repositoryRoot, 'browser-seed.json', false), expectedIssuer)
}

export async function readBrowserFixtureMetadata(
    repositoryRoot: string,
    expected: BrowserSeedMetadata,
): Promise<BrowserFixtureMetadata | null> {
    validateBrowserSeedMetadata(expected, expected.issuer)
    const value = await readJson(repositoryRoot, 'browser-users.json', true)
    return value === missingFile ? null : validateBrowserFixtureMetadata(value, expected)
}

export async function writeBrowserFixtureMetadata(
    repositoryRoot: string,
    metadata: BrowserFixtureMetadata,
    expected: BrowserSeedMetadata,
): Promise<void> {
    let handle: FileHandle | undefined
    let temporaryPath: string | undefined
    try {
        validateBrowserFixtureMetadata(metadata, expected)
        const directory = await metadataDirectory(repositoryRoot)
        const destination = join(directory, 'browser-users.json')
        await checkedFile(destination, true)
        const candidate = join(directory, `.browser-users.${randomUUID()}.tmp`)
        handle = await fs.open(
            candidate,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
            0o600,
        )
        temporaryPath = candidate
        await handle.chmod(0o600)
        await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8' })
        await handle.sync()
        await handle.close()
        handle = undefined
        await metadataDirectory(repositoryRoot)
        await checkedFile(destination, true)
        await checkedFile(temporaryPath, false)
        await fs.rename(temporaryPath, destination)
        temporaryPath = undefined
        await checkedFile(destination, false)
    } catch {
        throw browserFixtureError()
    } finally {
        await handle?.close().catch(() => undefined)
        if (temporaryPath) await fs.unlink(temporaryPath).catch(() => undefined)
    }
}
