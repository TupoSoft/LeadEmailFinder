import { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import axios from 'axios'
import { createServer, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { HttpDomainSynonymDiscovery } from './http-domain-synonym-discovery'

describe('HttpDomainSynonymDiscovery HTTP contract', () => {
    let server: Server
    let moduleRef: TestingModule
    let baseUrl: string
    let finder: HttpDomainSynonymDiscovery
    const requests: string[] = []
    const logger = { error: jest.fn() }

    beforeAll(async () => {
        server = createServer((request, response) => {
            const path = request.url ?? '/'
            requests.push(path)
            if (path === '/slow') return
            if (path === '/failure') {
                response.writeHead(503, { 'content-type': 'text/html' })
                response.end('Remote failure body contains unique-person@private.example')
                return
            }
            if (path === '/malformed') {
                response.writeHead(200, { 'content-type': 'application/json' })
                response.end(JSON.stringify({ content: 'unique-person@private.example' }))
                return
            }

            response.writeHead(200, { 'content-type': 'text/html' })
            response.end(
                path === '/home'
                    ? `home@example.com <a href="/contact">Contact</a>
                        <a href="/failure">Privacy</a><a href="/slow">Privacy archive</a>`
                    : 'contact@example.org',
            )
        })
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        moduleRef = await Test.createTestingModule({
            providers: [
                HttpDomainSynonymDiscovery,
                { provide: HttpService, useValue: new HttpService(axios.create({ timeout: 100, proxy: false })) },
                { provide: Logger, useValue: logger },
            ],
        }).compile()
        finder = moduleRef.get(HttpDomainSynonymDiscovery)
    })

    beforeEach(() => {
        requests.length = 0
        logger.error.mockClear()
    })

    afterAll(async () => {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
        await moduleRef.close()
    })

    it('retains successful pages when child status/deadline failures occur, with no retries', async () => {
        await expect(finder.findSynonymDomains(`${baseUrl}/home`)).resolves.toEqual(['example.com', 'example.org'])

        expect(requests[0]).toBe('/home')
        // Child pages are fetched concurrently, so only their exact counts have a stable contract.
        expect(requests.slice(1).sort()).toEqual(['/contact', '/failure', '/slow'])
        expect(logger.error).not.toHaveBeenCalled()
    })

    it.each(['/failure', '/malformed', '/slow'])(
        'returns no domains for homepage status, malformed-content, or configured-deadline failure: %s',
        async path => {
            await expect(finder.findSynonymDomains(`${baseUrl}${path}`)).resolves.toEqual([])

            expect(requests).toEqual([path])
            expect(logger.error).toHaveBeenCalledTimes(1)
            expect(logger.error).toHaveBeenCalledWith('domain_synonym_fetch_failed', {
                errorClass: path === '/malformed' ? 'Error' : 'AxiosError',
            })
            const serializedLogs = JSON.stringify(logger.error.mock.calls)
            expect(serializedLogs).not.toContain('unique-person@private.example')
            expect(serializedLogs).not.toContain(baseUrl)
            expect(serializedLogs).not.toContain('Remote failure')
        },
    )
})
