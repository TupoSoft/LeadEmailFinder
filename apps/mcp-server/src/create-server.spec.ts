import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { AccessTokenProvider } from './auth/token-cache.js'
import { createApp } from './main.js'

const fakeTokenCache: AccessTokenProvider = { getAccessToken: () => Promise.resolve('fake-access-token') }
const validAuthorizationHeader = `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`

describe('mcp-server scaffold', () => {
    let server: Server
    let baseUrl: URL

    beforeAll(async () => {
        server = createApp({ tokenCache: fakeTokenCache, apiBaseUrl: 'https://lef-api.example' })
        await new Promise<void>(resolve => server.listen(0, resolve))
        const { port } = server.address() as AddressInfo
        baseUrl = new URL(`http://127.0.0.1:${port}/`)
    })

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
    })

    it('answers GET /health with 200 and a status body', async () => {
        const response = await fetch(new URL('health', baseUrl))

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ status: 'ok' })
    })

    it('lists exactly the five registered tools over the real MCP protocol', async () => {
        const client = new Client({ name: 'create-server.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL('mcp', baseUrl), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)

        try {
            const { tools } = await client.listTools()

            expect(tools.map(tool => tool.name).sort()).toEqual([
                'check_async_verification',
                'check_credit_balance',
                'get_verification_result',
                'submit_async_verification',
                'verify_email',
            ])
        } finally {
            await client.close()
        }
    })
})
