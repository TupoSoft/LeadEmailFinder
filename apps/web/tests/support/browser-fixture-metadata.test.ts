// @vitest-environment node
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    BROWSER_FIXTURE_IDENTITIES,
    DEVELOPMENT_BROWSER_ISSUER,
    generateBrowserFixtureResetId,
} from '../../../../scripts/keycloak/browser-fixture-identities.ts'
import {
    browserFixtureError,
    readBrowserFixtureMetadata,
    readBrowserSeedMetadata,
    validateBrowserFixtureMetadata,
    validateBrowserSeedMetadata,
    writeBrowserFixtureMetadata,
    type BrowserFixtureMetadata,
    type BrowserSeedMetadata,
} from './browser-fixture-metadata.ts'

const ownerSubject = '7ddf443f-bd55-48eb-9fbd-e760e92d5f60'
const operatorSubject = '8ba3e1f3-12b9-4fea-a6c9-11c39a4bb869'
// Published RFC 6238 test key, never a provisioned fixture credential.
const publicTestKey = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

function seedMetadata(issuer = DEVELOPMENT_BROWSER_ISSUER): BrowserSeedMetadata {
    return {
        version: 1,
        issuer,
        resetId: generateBrowserFixtureResetId(issuer, { owner: ownerSubject, platformOperator: operatorSubject }),
        users: {
            owner: { ...BROWSER_FIXTURE_IDENTITIES.owner, subject: ownerSubject },
            platformOperator: { ...BROWSER_FIXTURE_IDENTITIES.platformOperator, subject: operatorSubject },
        },
    }
}

function fixtureMetadata(seed: BrowserSeedMetadata = seedMetadata()): BrowserFixtureMetadata {
    return {
        version: 1,
        resetId: seed.resetId,
        users: {
            owner: { email: seed.users.owner.email, subject: seed.users.owner.subject, totpSecret: publicTestKey },
            platformOperator: {
                email: seed.users.platformOperator.email,
                subject: seed.users.platformOperator.subject,
                totpSecret: publicTestKey,
            },
        },
    }
}

describe('browser fixture metadata contract', () => {
    let root: string
    let directory: string
    let destination: string

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), 'lef-browser-fixture-'))
        directory = join(root, '.dev', 'keycloak')
        destination = join(directory, 'browser-users.json')
        await fs.mkdir(directory, { recursive: true })
        await fs.writeFile(join(directory, 'browser-seed.json'), JSON.stringify(seedMetadata()), { mode: 0o600 })
    })

    afterEach(async () => {
        vi.restoreAllMocks()
        await fs.rm(root, { recursive: true, force: true })
    })

    it('reads matching, exact development seed metadata', async () => {
        expect(await readBrowserSeedMetadata(root)).toEqual(seedMetadata())
    })

    it('accepts an explicitly matched owned development issuer', async () => {
        const issuer = 'http://localhost:58181/realms/lead-email-finder'
        const seed = seedMetadata(issuer)
        await fs.writeFile(join(directory, 'browser-seed.json'), JSON.stringify(seed))
        expect(await readBrowserSeedMetadata(root, issuer)).toEqual(seed)
        await expect(readBrowserSeedMetadata(root)).rejects.toThrow(browserFixtureError().message)
    })

    it.each([
        'https://localhost:58080/realms/lead-email-finder',
        'http://example.test:58080/realms/lead-email-finder',
        'http://localhost/realms/lead-email-finder',
        'http://localhost:0/realms/lead-email-finder',
        'http://localhost:58080/realms/another-realm',
        'http://localhost:58080/realms/lead-email-finder?code=hidden',
        'http://localhost:58080/realms/lead-email-finder#hidden',
        'http://user:password@localhost:58080/realms/lead-email-finder',
    ])('rejects unsafe seed issuer case %#', issuer => {
        expect(() => validateBrowserSeedMetadata(seedMetadata(issuer), issuer)).toThrow(browserFixtureError().message)
    })

    it('treats only a missing fixture file as fresh enrollment', async () => {
        expect(await readBrowserFixtureMetadata(root, seedMetadata())).toBeNull()
        await fs.writeFile(destination, 'null', { mode: 0o600 })
        await expect(readBrowserFixtureMetadata(root, seedMetadata())).rejects.toThrow(browserFixtureError().message)
    })

    it('rejects stale expected seed metadata before allowing enrollment', async () => {
        const seed = seedMetadata()
        seed.resetId = 'stale'
        await expect(readBrowserFixtureMetadata(root, seed)).rejects.toThrow(browserFixtureError().message)
    })

    it('writes only the fixed local path with mode 0600 and rereads matching metadata', async () => {
        await writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())
        expect((await fs.stat(destination)).mode & 0o777).toBe(0o600)
        expect(await readBrowserFixtureMetadata(root, seedMetadata())).toEqual(fixtureMetadata())
        expect(await fs.readdir(directory)).toEqual(['browser-seed.json', 'browser-users.json'])
    })

    it('creates the temporary file with mode 0600 and atomically replaces the final file', async () => {
        await writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())
        const oldInode = (await fs.stat(destination)).ino
        const originalRename = fs.rename.bind(fs)
        const rename = vi.spyOn(fs, 'rename').mockImplementation(async (source, target) => {
            expect((await fs.stat(source)).mode & 0o777).toBe(0o600)
            expect(await fs.readFile(destination, 'utf8')).toBe(`${JSON.stringify(fixtureMetadata(), null, 2)}\n`)
            await originalRename(source, target)
        })
        const replacement = fixtureMetadata()
        replacement.users.owner.totpSecret = 'MZXW6YTB'
        await writeBrowserFixtureMetadata(root, replacement, seedMetadata())
        expect(rename).toHaveBeenCalledOnce()
        expect((await fs.stat(destination)).ino).not.toBe(oldInode)
        expect(await readBrowserFixtureMetadata(root, seedMetadata())).toEqual(replacement)
    })

    it('cleans the temporary file and preserves the old file after an atomic rename failure', async () => {
        await writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())
        const before = await fs.readFile(destination, 'utf8')
        vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('setup-key=private-value; code=private-code'))
        await expect(writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())).rejects.toThrow(
            browserFixtureError().message,
        )
        expect(await fs.readFile(destination, 'utf8')).toBe(before)
        expect(await fs.readdir(directory)).toEqual(['browser-seed.json', 'browser-users.json'])
    })

    it('leaves no final or temporary file if the initial atomic write fails', async () => {
        vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('private provider error'))
        await expect(writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())).rejects.toThrow(
            browserFixtureError().message,
        )
        expect(await fs.readdir(directory)).toEqual(['browser-seed.json'])
    })

    it('closes and removes a temporary file after a write failure', async () => {
        const open = fs.open.bind(fs)
        vi.spyOn(fs, 'open').mockImplementationOnce(async (...arguments_) => {
            const handle = await open(...arguments_)
            vi.spyOn(handle, 'writeFile').mockRejectedValueOnce(new Error('private enrollment payload'))
            return handle
        })
        await expect(writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())).rejects.toThrow(
            browserFixtureError().message,
        )
        expect(await fs.readdir(directory)).toEqual(['browser-seed.json'])
    })

    it.each(['.dev', 'keycloak', 'repository'])('refuses a symlink in the %s parent path', async component => {
        const original = component === '.dev' ? join(root, '.dev') : component === 'keycloak' ? directory : root
        const moved = component === 'repository' ? join(root, 'real-repository') : `${original}-real`
        if (component === 'repository') {
            await fs.mkdir(moved)
            await fs.rename(join(root, '.dev'), join(moved, '.dev'))
            await fs.symlink(moved, join(root, 'linked-repository'), 'dir')
            await expect(readBrowserSeedMetadata(join(root, 'linked-repository'))).rejects.toThrow(
                browserFixtureError().message,
            )
            await expect(
                writeBrowserFixtureMetadata(join(root, 'linked-repository'), fixtureMetadata(), seedMetadata()),
            ).rejects.toThrow(browserFixtureError().message)
        } else {
            await fs.rename(original, moved)
            await fs.symlink(moved, original, 'dir')
            await expect(readBrowserSeedMetadata(root)).rejects.toThrow(browserFixtureError().message)
            await expect(writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())).rejects.toThrow(
                browserFixtureError().message,
            )
        }
    })

    it('rejects a symlink at the final file without altering its external target', async () => {
        const external = join(root, 'outside.json')
        await fs.writeFile(external, 'unchanged', { mode: 0o600 })
        await fs.symlink(external, destination)
        await expect(readBrowserFixtureMetadata(root, seedMetadata())).rejects.toThrow(browserFixtureError().message)
        await expect(writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())).rejects.toThrow(
            browserFixtureError().message,
        )
        expect(await fs.readFile(external, 'utf8')).toBe('unchanged')
    })

    it('rejects a dangling symlink instead of treating it as missing enrollment metadata', async () => {
        await fs.symlink(join(root, 'absent'), destination)
        await expect(readBrowserFixtureMetadata(root, seedMetadata())).rejects.toThrow(browserFixtureError().message)
    })

    it('rejects a symlink to seed metadata', async () => {
        const seedPath = join(directory, 'browser-seed.json')
        const external = join(root, 'seed.json')
        await fs.rename(seedPath, external)
        await fs.symlink(external, seedPath)
        await expect(readBrowserSeedMetadata(root)).rejects.toThrow(browserFixtureError().message)
    })

    it('rejects a directory where the secret file should be', async () => {
        await fs.mkdir(destination, { mode: 0o600 })
        await expect(readBrowserFixtureMetadata(root, seedMetadata())).rejects.toThrow(browserFixtureError().message)
        await expect(writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())).rejects.toThrow(
            browserFixtureError().message,
        )
    })

    it('rejects hard links to prevent sharing the secret file outside its owned path', async () => {
        await writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())
        await fs.link(destination, join(root, 'outside.json'))
        await expect(readBrowserFixtureMetadata(root, seedMetadata())).rejects.toThrow(browserFixtureError().message)
    })

    it.each([0o644, 0o666, 0o400, 0o700])(
        'rejects file permissions %i instead of silently repairing them',
        async mode => {
            await writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())
            await fs.chmod(destination, mode)
            await expect(readBrowserFixtureMetadata(root, seedMetadata())).rejects.toThrow(
                browserFixtureError().message,
            )
            await expect(writeBrowserFixtureMetadata(root, fixtureMetadata(), seedMetadata())).rejects.toThrow(
                browserFixtureError().message,
            )
        },
    )

    it('rejects malformed JSON, oversized files, and unexpected credentials without reflecting their contents', async () => {
        for (const content of [
            '{"totpSecret":"private-enrollment-key",',
            'x'.repeat(16_385),
            JSON.stringify({ password: 'private-password' }),
        ]) {
            await fs.writeFile(destination, content, { mode: 0o600 })
            const error = await readBrowserFixtureMetadata(root, seedMetadata()).catch((error: unknown) => error)
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toBe(browserFixtureError().message)
            expect((error as Error).cause).toBeUndefined()
            expect((error as Error).stack).not.toMatch(/private-enrollment-key|private-password/)
        }
    })

    it.each([
        (metadata: BrowserFixtureMetadata) => ({ ...metadata, version: 2 }),
        (metadata: BrowserFixtureMetadata) => ({ ...metadata, resetId: 'stale' }),
        (metadata: BrowserFixtureMetadata) => ({ ...metadata, password: 'private-password' }),
        (metadata: BrowserFixtureMetadata) => ({
            ...metadata,
            users: { ...metadata.users, operator: metadata.users.owner },
        }),
        (metadata: BrowserFixtureMetadata) => ({
            ...metadata,
            users: { ...metadata.users, owner: { ...metadata.users.owner, subject: operatorSubject } },
        }),
        (metadata: BrowserFixtureMetadata) => ({
            ...metadata,
            users: { ...metadata.users, owner: { ...metadata.users.owner, email: 'other@example.test' } },
        }),
        (metadata: BrowserFixtureMetadata) => ({
            ...metadata,
            users: { ...metadata.users, owner: { ...metadata.users.owner, totpSecret: 'lowercase-key' } },
        }),
    ])('rejects stale or invalid fixture schema case %#', change => {
        expect(() => validateBrowserFixtureMetadata(change(fixtureMetadata()), seedMetadata())).toThrow(
            browserFixtureError().message,
        )
    })

    it.each([
        (seed: BrowserSeedMetadata) => ({ ...seed, version: 2 }),
        (seed: BrowserSeedMetadata) => ({ ...seed, resetId: '0'.repeat(64) }),
        (seed: BrowserSeedMetadata) => ({
            ...seed,
            users: { ...seed.users, owner: { ...seed.users.owner, role: 'viewer' } },
        }),
        (seed: BrowserSeedMetadata) => ({
            ...seed,
            users: { ...seed.users, owner: { ...seed.users.owner, email: 'other@example.test' } },
        }),
        (seed: BrowserSeedMetadata) => ({
            ...seed,
            users: { ...seed.users, owner: { ...seed.users.owner, subject: '../../elsewhere' } },
        }),
        (seed: BrowserSeedMetadata) => ({
            ...seed,
            users: { ...seed.users, owner: { ...seed.users.owner, subject: `${ownerSubject}\n` } },
        }),
        (seed: BrowserSeedMetadata) => ({
            ...seed,
            users: { ...seed.users, owner: { ...seed.users.owner, subject: operatorSubject } },
        }),
    ])('rejects invalid seed schema case %#', change => {
        expect(() => validateBrowserSeedMetadata(change(seedMetadata()))).toThrow(browserFixtureError().message)
    })
})
