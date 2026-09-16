import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createApp } from './main.js'

describe('mcp-server scaffold', () => {
    let server: Server
    let baseUrl: URL

    beforeAll(async () => {
        server = createApp()
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

    it('lists exactly one tool, ping, over the real MCP protocol', async () => {
        const client = new Client({ name: 'create-server.spec', version: '0.0.0' })
        const transport = new StreamableHTTPClientTransport(new URL('mcp', baseUrl))
        await client.connect(transport)

        try {
            const { tools } = await client.listTools()

            expect(tools).toHaveLength(1)
            expect(tools[0]?.name).toBe('ping')
        } finally {
            await client.close()
        }
    })
})
