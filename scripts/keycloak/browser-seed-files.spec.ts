import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBrowserSeedMetadata } from './browser-fixture-seed'
import { readPreviousFixture, writeBrowserSeedMetadata } from './browser-seed-files'

jest.mock('node:fs/promises', () => {
    const actual = jest.requireActual<typeof fs>('node:fs/promises')
    return { ...actual, rename: jest.fn(actual.rename) }
})

describe('nonsecret browser seed files', () => {
    let directory: string
    beforeEach(async () => {
        directory = await fs.mkdtemp(join(tmpdir(), 'lef-browser-seed-'))
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await fs.rm(directory, { recursive: true, force: true })
    })

    it('writes an owner-readable snapshot without touching existing enrollment data', async () => {
        const file = join(directory, 'browser-seed.json')
        const enrolled = join(directory, 'browser-users.json')
        await fs.writeFile(enrolled, 'synthetic existing enrollment state', { mode: 0o600 })
        const metadata = createBrowserSeedMetadata({ owner: 'owner-1', platformOperator: 'operator-1' })
        await writeBrowserSeedMetadata(file, metadata)
        await writeBrowserSeedMetadata(file, metadata)
        expect(await readPreviousFixture(file)).toEqual(metadata)
        expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
        expect(await fs.readFile(enrolled, 'utf8')).toBe('synthetic existing enrollment state')
        expect((await fs.readdir(directory)).sort()).toEqual(['browser-seed.json', 'browser-users.json'])
    })

    it('preserves the previous complete snapshot and cleans temporary files on a failed rename', async () => {
        const file = join(directory, 'browser-seed.json')
        const original = createBrowserSeedMetadata({ owner: 'owner-1', platformOperator: 'operator-1' })
        await writeBrowserSeedMetadata(file, original)
        jest.mocked(fs.rename).mockRejectedValueOnce(new Error('synthetic atomic rename failure'))
        await expect(
            writeBrowserSeedMetadata(
                file,
                createBrowserSeedMetadata({ owner: 'owner-2', platformOperator: 'operator-2' }),
            ),
        ).rejects.toThrow('atomic rename failure')
        expect(await readPreviousFixture(file)).toEqual(original)
        expect(await fs.readdir(directory)).toEqual(['browser-seed.json'])
    })

    it('rejects a symlink without overwriting its target', async () => {
        const target = join(directory, 'target.json')
        await fs.writeFile(target, '{}')
        const file = join(directory, 'browser-seed.json')
        await fs.symlink(target, file)
        await expect(readPreviousFixture(file)).rejects.toThrow('regular local file')
        await expect(
            writeBrowserSeedMetadata(
                file,
                createBrowserSeedMetadata({ owner: 'owner-1', platformOperator: 'operator-1' }),
            ),
        ).rejects.toThrow('regular local file')
        expect(await fs.readFile(target, 'utf8')).toBe('{}')
    })

    it('treats only an absent previous snapshot as missing provenance', async () => {
        const file = join(directory, 'missing.json')
        expect(await readPreviousFixture(file)).toBeUndefined()
        await fs.writeFile(file, 'invalid JSON')
        await expect(readPreviousFixture(file)).rejects.toThrow()
    })
})
