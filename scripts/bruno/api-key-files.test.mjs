import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { readApiKeyFixture, validateApiKeyFixture } from '../better-auth/api-key-files.mjs'

test('API-key fixture files require current checkout provenance, current stack, and private permissions', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'lef-api-key-files-'))
    const metadata = { composeProject: 'lef-test' }
    const apiKey = 'lef_' + 'a'.repeat(43)
    const fixture = {
        version: 1,
        kind: 'customer',
        checkoutRoot: root,
        composeProject: metadata.composeProject,
        issuer: 'urn:lead-email-finder:auth',
        organizationId: randomUUID(),
        credentialId: randomUUID(),
        keyPrefix: apiKey.slice(0, 12),
        apiKey,
    }
    const file = resolve(root, '.dev/auth/customer-api-key.json')
    try {
        await mkdir(resolve(root, '.dev/auth'), { recursive: true, mode: 0o700 })
        await writeFile(file, JSON.stringify(fixture), { mode: 0o600 })
        assert.deepEqual(await readApiKeyFixture(root, metadata, 'customer'), fixture)
        for (const changed of [
            { ...fixture, checkoutRoot: '/foreign' },
            { ...fixture, composeProject: 'foreign' },
            { ...fixture, keyPrefix: 'incorrect' },
            { ...fixture, apiKey: 'sensitive-invalid' },
        ]) {
            assert.throws(
                () => validateApiKeyFixture(changed, root, metadata, 'customer'),
                error => {
                    assert.equal(error.message.includes(apiKey), false)
                    return /checkout-owned/.test(error.message)
                },
            )
        }
        assert.throws(() => validateApiKeyFixture(fixture, root, metadata, 'mcp-live'), /checkout-owned/)
        await chmod(file, 0o644)
        await assert.rejects(readApiKeyFixture(root, metadata, 'customer'), /private regular file/)
        await chmod(file, 0o600)
        await rm(file)
        const foreign = resolve(root, 'foreign.json')
        await writeFile(foreign, JSON.stringify(fixture), { mode: 0o600 })
        await symlink(foreign, file)
        await assert.rejects(readApiKeyFixture(root, metadata, 'customer'), /private regular file/)
        await rm(file)
        await writeFile(file, 'not-json-sensitive-marker', { mode: 0o600 })
        await assert.rejects(readApiKeyFixture(root, metadata, 'customer'), error => {
            assert.equal(error.message.includes('sensitive-marker'), false)
            return /missing or invalid/.test(error.message)
        })
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
