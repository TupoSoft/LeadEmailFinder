import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { assertKeyRejected, assertVerificationOnlyAccess, cleanupMcpFixture } from './mcp-server-live.mjs'

test('revoked-key evidence covers initialize, list, and a tool call without an OAuth grant', async () => {
    const methods = []
    await assertKeyRejected('http://localhost/mcp', 'synthetic-key', async (url, options) => {
        assert.equal(url, 'http://localhost/mcp')
        assert.equal(options.headers.Authorization, 'Bearer synthetic-key')
        methods.push(JSON.parse(options.body).method)
        return { status: 401 }
    })
    assert.deepEqual(methods, ['initialize', 'tools/list', 'tools/call'])
    await assert.rejects(
        assertKeyRejected('http://localhost/mcp', 'key', async () => ({ status: 200 })),
        /revoked/,
    )
})

test('verification-only evidence requires initialization, tool listing, billing rejection, and client cleanup', async () => {
    const events = []
    const sdk = {
        Client: class {
            async connect() {
                events.push('connect')
            }
            async listTools() {
                events.push('list')
                return { tools: [{ name: 'verify_email' }] }
            }
            async callTool(value) {
                assert.equal(value.name, 'check_credit_balance')
                events.push('billing')
                return { isError: true }
            }
            async close() {
                events.push('close')
            }
        },
        StreamableHTTPClientTransport: class {
            constructor(_url, options) {
                assert.equal(options.requestInit.headers.Authorization, 'Bearer key')
            }
        },
    }
    await assertVerificationOnlyAccess(sdk, 'http://localhost/mcp', 'key')
    assert.deepEqual(events, ['connect', 'list', 'billing', 'close'])
})

test('MCP fixture cleanup skips only absent metadata and propagates invalid or foreign files', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'lef-mcp-cleanup-'))
    const metadata = { composeProject: 'lef-test' }
    let removals = 0
    const remove = () => {
        removals++
    }
    try {
        await cleanupMcpFixture(root, metadata, remove)
        assert.equal(removals, 0)
        await mkdir(resolve(root, '.dev/auth'), { recursive: true, mode: 0o700 })
        const file = resolve(root, '.dev/auth/mcp-live-api-key.json')
        await writeFile(file, 'corrupt-metadata', { mode: 0o600 })
        await assert.rejects(cleanupMcpFixture(root, metadata, remove), /missing or invalid/)
        assert.equal(removals, 0)
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
        await writeFile(file, JSON.stringify(fixture))
        await assert.rejects(cleanupMcpFixture(root, metadata, remove), /checkout-owned/)
        assert.equal(removals, 0)
        await writeFile(file, JSON.stringify({ ...fixture, kind: 'mcp-live' }))
        await cleanupMcpFixture(root, metadata, remove)
        assert.equal(removals, 1)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})
