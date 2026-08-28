import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeDevelopmentSecretFile } from './development-secret-file'

describe(writeDevelopmentSecretFile.name, () => {
    const temporaryDirectories: string[] = []

    async function createTemporaryDirectory(): Promise<string> {
        const directory = await mkdtemp(join(tmpdir(), 'lef-development-secret-'))
        temporaryDirectories.push(directory)
        return directory
    }

    afterEach(async () => {
        await Promise.all(
            temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
        )
    })

    it('writes a new secret file and creates its parent directories', async () => {
        const root = await createTemporaryDirectory()
        const filePath = join(root, 'keycloak', 'service-client.json')

        await writeDevelopmentSecretFile(filePath, '{"clientId":"test"}\n', 0o640)

        await expect(readFile(filePath, 'utf8')).resolves.toBe('{"clientId":"test"}\n')
        await expect(stat(filePath)).resolves.toMatchObject({ mode: expect.any(Number) })
        expect((await stat(filePath)).mode & 0o777).toBe(0o640)
    })

    it('replaces an empty directory left by a legacy Docker bind mount', async () => {
        const root = await createTemporaryDirectory()
        const filePath = join(root, 'service-client.json')
        await mkdir(filePath)

        await writeDevelopmentSecretFile(filePath, '{}\n', 0o600)

        await expect(readFile(filePath, 'utf8')).resolves.toBe('{}\n')
        expect((await stat(filePath)).isFile()).toBe(true)
    })

    it('preserves a non-empty directory instead of deleting unexpected data', async () => {
        const root = await createTemporaryDirectory()
        const filePath = join(root, 'service-client.json')
        await mkdir(filePath)
        await writeFile(join(filePath, 'unexpected.txt'), 'keep me')

        await expect(writeDevelopmentSecretFile(filePath, '{}\n', 0o600)).rejects.toMatchObject({
            code: expect.stringMatching(/^(ENOTEMPTY|EEXIST)$/),
        })
        await expect(readFile(join(filePath, 'unexpected.txt'), 'utf8')).resolves.toBe('keep me')
    })
})
