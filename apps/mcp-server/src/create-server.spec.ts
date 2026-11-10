import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createApp } from './main.js'

const validAuthorizationHeader = `Bearer lef_${'a'.repeat(43)}`

describe('mcp-server scaffold', () => {
    let server: Server
    let baseUrl: URL

    beforeAll(async () => {
        server = createApp({ validateKey: () => Promise.resolve('valid'), apiBaseUrl: 'https://lef-api.example' })
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

    it('lists exactly the six registered tools over the real MCP protocol', async () => {
        const client = new Client({ name: 'create-server.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL('mcp', baseUrl), {
            requestInit: { headers: { Authorization: validAuthorizationHeader } },
        })
        await client.connect(transport)

        try {
            const { tools } = await client.listTools()

            expect(tools.map(tool => tool.name).sort()).toEqual([
                'check_async_verification',
                'check_batch_verification',
                'check_credit_balance',
                'download_batch_results',
                'submit_async_verification',
                'submit_batch_verification',
            ])
        } finally {
            await client.close()
        }
    })
})
