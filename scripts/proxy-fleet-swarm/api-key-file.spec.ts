import { chmod, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readApiKeyFile } from './api-key-file'

const apiKey = `lef_${'a'.repeat(43)}`

describe('proxy fleet API-key file', () => {
    let dir: string
    let path: string
    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'proxy-fleet-api-key-'))
        path = join(dir, 'api-key.json')
    })
    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })
    it('reads a private API-key file directly and observes replacement without a cache or OAuth exchange', async () => {
        await writeFile(path, JSON.stringify({ apiKey, credentialId: 'metadata-is-not-forwarded' }), { mode: 0o600 })
        expect(await readApiKeyFile(path)).toBe(apiKey)
        const replacement = `lef_${'b'.repeat(43)}`
        await writeFile(path, JSON.stringify({ apiKey: replacement }), { mode: 0o600 })
        expect(await readApiKeyFile(path)).toBe(replacement)
    })
    it.each([
        null,
        {},
        { issuer: 'https://issuer', clientId: 'legacy', clientSecret: 'secret' },
        { apiKey: '' },
        { apiKey: `Bearer ${apiKey}` },
        { apiKey: `${apiKey}\n` },
    ])('rejects malformed or legacy credential shapes without exposing input', async payload => {
        await writeFile(path, JSON.stringify(payload), { mode: 0o600 })
        await expect(readApiKeyFile(path)).rejects.toThrow('API-key file must contain a valid apiKey string')
    })
    it('redacts malformed JSON diagnostics', async () => {
        await writeFile(path, `${apiKey}{invalid`, { mode: 0o600 })
        await expect(readApiKeyFile(path)).rejects.toThrow('API-key file must contain valid JSON')
    })
    it('rejects a broadly readable file', async () => {
        await writeFile(path, JSON.stringify({ apiKey }), { mode: 0o600 })
        await chmod(path, 0o644)
        await expect(readApiKeyFile(path)).rejects.toThrow('private regular file')
    })
    it('rejects symlink input rather than reading the target', async () => {
        const target = join(dir, 'target.json')
        await writeFile(target, JSON.stringify({ apiKey }), { mode: 0o600 })
        await symlink(target, path)
        await expect(readApiKeyFile(path)).rejects.toThrow()
    })
})
