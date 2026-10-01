import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { customerClientSecret } from '../bruno/async-verification-fixture.mjs'
import { inspectDevelopmentService, loadDevelopmentStack } from './development-stack.mjs'

const DEFAULT_MCP_SERVER_PORT = '53002'
const SEEDED_CUSTOMER_CLIENT_ID = 'lef-svc-dev-fixture'
const BATCH_POLL_ATTEMPTS = 30
const BATCH_POLL_INTERVAL_MS = 2_000

/** Loads the pinned MCP SDK straight from `apps/mcp-server`'s own installed dependency -- this script
 * lives at the repository root, outside that package's own module resolution, the same way
 * `web-live.mjs`'s `bundleBrowserClient` resolves `vite` scoped to `apps/web`. */
async function loadSdkClient(root) {
    const sdkRoot = resolve(root, 'apps/mcp-server/node_modules/@modelcontextprotocol/sdk')
    const { Client } = await import(pathToFileURL(resolve(sdkRoot, 'dist/esm/client/index.js')).href)
    const { StreamableHTTPClientTransport } = await import(pathToFileURL(resolve(sdkRoot, 'dist/esm/client/streamableHttp.js')).href)
    return { Client, StreamableHTTPClientTransport }
}

async function callTool(sdk, mcpUrl, authorizationHeader, name, args) {
    const client = new sdk.Client({ name: 'mcp-server-live', version: '0.0.0' })
    const transport = new sdk.StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers: { Authorization: authorizationHeader } } })
    await client.connect(transport)
    try {
        return await client.callTool({ name, arguments: args })
    } finally {
        await client.close()
    }
}

function textOf(result) {
    const text = result?.content?.[0]?.text
    if (typeof text !== 'string') throw new Error('MCP live validation: tool call returned no text content')
    return text
}

function parseJsonResult(result, toolName) {
    if (result?.isError) throw new Error(`MCP live validation: ${toolName} returned isError`)
    try {
        return JSON.parse(textOf(result))
    } catch {
        throw new Error(`MCP live validation: ${toolName} returned non-JSON content`)
    }
}

/** Mints a bearer token the same way the connector's own `TokenCache` does, to fetch the billing
 * summary directly and confirm `check_credit_balance` shows the same organization's real numbers --
 * not just an internally self-consistent shape. */
async function directBillingSummary(apiUrl, issuer, clientId, clientSecret) {
    const tokenResponse = await fetch(`${issuer}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
        signal: AbortSignal.timeout(15_000),
    })
    if (!tokenResponse.ok) throw new Error('MCP live validation: direct token grant failed')
    const { access_token: accessToken } = await tokenResponse.json()
    if (!accessToken) throw new Error('MCP live validation: direct token grant returned no access token')

    const billingResponse = await fetch(`${apiUrl}/v1/billing/summary`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
    })
    if (!billingResponse.ok) throw new Error('MCP live validation: direct billing summary request failed')
    return billingResponse.json()
}

async function verifySingleAddress(sdk, mcpUrl, authorizationHeader, email) {
    const outcome = await callTool(sdk, mcpUrl, authorizationHeader, 'verify_email', { email })
    if (outcome.isError) throw new Error('MCP live validation: verify_email returned isError')
    const text = textOf(outcome)

    let result
    try {
        result = JSON.parse(text)
    } catch {
        // The API's own synchronous budget was exhausted; verify_email returns a plain-language
        // pointer (not JSON) naming the id to poll, exactly as mcp-connector/04 documents.
        const idMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        if (!idMatch) throw new Error('MCP live validation: verify_email async-fallback text has no id')
        for (let attempt = 0; attempt < BATCH_POLL_ATTEMPTS; attempt++) {
            const status = parseJsonResult(await callTool(sdk, mcpUrl, authorizationHeader, 'check_async_verification', { id: idMatch[0] }), 'check_async_verification')
            if (status.state === 'completed') {
                result = status.result
                break
            }
            if (status.state === 'failed' || status.state === 'unavailable') throw new Error(`MCP live validation: async verification ended in state ${status.state}`)
            await new Promise(resolvePromise => setTimeout(resolvePromise, BATCH_POLL_INTERVAL_MS))
        }
        if (!result) throw new Error('MCP live validation: async verification did not complete in time')
    }

    if (result.email !== email) throw new Error('MCP live validation: verify_email result address does not match the request')
    return result
}

async function runBatchRoundTrip(sdk, mcpUrl, authorizationHeader) {
    const stamp = Date.now()
    const addresses = [`mcp-live-batch-1-${stamp}@lef.test`, `mcp-live-batch-2-${stamp}@lef.test`]

    const submitted = parseJsonResult(await callTool(sdk, mcpUrl, authorizationHeader, 'submit_batch_verification', { emails: addresses }), 'submit_batch_verification')
    if (typeof submitted.id !== 'string' || submitted.id === '') throw new Error('MCP live validation: submit_batch_verification returned no id')

    let status
    for (let attempt = 0; attempt < BATCH_POLL_ATTEMPTS; attempt++) {
        status = parseJsonResult(await callTool(sdk, mcpUrl, authorizationHeader, 'check_batch_verification', { id: submitted.id }), 'check_batch_verification')
        if (['completed', 'failed', 'unavailable'].includes(status.status)) break
        await new Promise(resolvePromise => setTimeout(resolvePromise, BATCH_POLL_INTERVAL_MS))
    }
    if (status?.status !== 'completed' || !status.resultsAvailable) throw new Error('MCP live validation: batch did not reach a completed, downloadable state in time')
    if (status.counts?.totalRows !== addresses.length) throw new Error('MCP live validation: batch status row count does not match the submitted addresses')

    const downloaded = parseJsonResult(await callTool(sdk, mcpUrl, authorizationHeader, 'download_batch_results', { id: submitted.id }), 'download_batch_results')
    if (downloaded.totalRows !== addresses.length || downloaded.rows.length !== addresses.length) {
        throw new Error('MCP live validation: download_batch_results row count does not match the submitted addresses')
    }
    const downloadedAddresses = new Set(downloaded.rows.map(row => row.email))
    if (!addresses.every(address => downloadedAddresses.has(address))) {
        throw new Error('MCP live validation: download_batch_results is missing a submitted address')
    }
}

export async function runMcpServerLive() {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const metadata = loadDevelopmentStack(root, { persistMetadata: false })
    const mcpServerBaseUrl = `http://localhost:${process.env.MCP_SERVER_PORT ?? DEFAULT_MCP_SERVER_PORT}`
    inspectDevelopmentService(root, metadata, 'mcp-server', '3002/tcp', mcpServerBaseUrl)
    const mcpUrl = `${mcpServerBaseUrl}/mcp`

    const issuer = `${metadata.keycloakUrl}/realms/lead-email-finder`
    const summary = JSON.parse(await readFile(resolve(root, '.dev/keycloak/customer-fixture.json'), 'utf8'))
    if (summary.issuer !== issuer || summary.keycloakClientId !== SEEDED_CUSTOMER_CLIENT_ID) {
        throw new Error('MCP live validation: seeded customer fixture does not match the current development stack')
    }
    const clientSecret = await customerClientSecret(metadata, summary.keycloakClientId)
    const authorizationHeader = `Basic ${Buffer.from(`${summary.keycloakClientId}:${clientSecret}`).toString('base64')}`

    const sdk = await loadSdkClient(root)

    const [toolBalanceResult, directBalance] = await Promise.all([
        callTool(sdk, mcpUrl, authorizationHeader, 'check_credit_balance', {}),
        directBillingSummary(metadata.apiUrl, issuer, summary.keycloakClientId, clientSecret),
    ])
    const toolBalance = parseJsonResult(toolBalanceResult, 'check_credit_balance')
    if (
        toolBalance.balance !== directBalance.balance ||
        toolBalance.reserved !== directBalance.reserved ||
        toolBalance.available !== directBalance.available
    ) {
        throw new Error('MCP live validation: check_credit_balance does not match a direct billing summary request')
    }

    await verifySingleAddress(sdk, mcpUrl, authorizationHeader, `mcp-live-${Date.now()}@lef.test`)
    await runBatchRoundTrip(sdk, mcpUrl, authorizationHeader)

    process.stdout.write(
        'MCP connector live: check_credit_balance (matching a direct billing summary request), verify_email, and the batch ' +
            'submit/check/download round trip all passed.\n',
    )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runMcpServerLive().catch(error => {
        // Error messages below are our own static text; upstream/token diagnostics stay private.
        process.stderr.write(
            `MCP connector live validation failed (${error instanceof Error && error.message.startsWith('MCP live validation') ? error.message : 'fixture or connector check'}); raw output withheld to protect credentials.\n`,
        )
        process.exitCode = 1
    })
}
