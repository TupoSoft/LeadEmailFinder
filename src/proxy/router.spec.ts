/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- test */

import { describe, expect, it, jest } from '@jest/globals'
import { ProxyRouter } from './router'
import { ProxyController } from './controller'
import express, { Router } from 'express'
import type { IProxyService } from './service'
import type { Proxy } from './repository'
import request from 'supertest'
import { constants } from 'node:http2'
import type { authenticate } from '../middleware'
import type { ProxyFVO } from './dto'

jest.mock('../middleware/authenticate', () => ({
    authenticate: jest.fn<typeof authenticate>().mockImplementation((req, res, next) => {
        next()
    }),
}))

export class MockProxyService implements IProxyService {
    getAll: () => Promise<Proxy[]> = jest.fn<typeof MockProxyService.prototype.getAll>()
    create: (proxy: Proxy) => Promise<Proxy> = jest.fn<typeof MockProxyService.prototype.create>()
}

describe('ProxyRouter', () => {
    const app = express()

    const expressRouter = Router()
    const mockProxyService = new MockProxyService() as jest.Mocked<MockProxyService>
    const proxyController = new ProxyController(mockProxyService)
    const proxyRouter = new ProxyRouter(expressRouter, proxyController)
    proxyRouter.init()

    app.use(express.json())
    app.use(expressRouter)

    const PROXY_PORT = 3333

    const proxy: Proxy = {
        id: '1',
        type: 'socks5',
        host: 'example.com',
        port: PROXY_PORT,
        user: 'foo',
        password: 'bar',
    }

    describe('GET /proxy', () => {
        it('should return HTTP_OK', async () => {
            const allProxies = [proxy]
            mockProxyService.getAll.mockResolvedValueOnce(allProxies)

            await request(app)
                .get(ProxyRouter.PATH)
                .expect('Content-Type', /json/)
                .expect(allProxies)
                .expect(constants.HTTP_STATUS_OK)

            expect(mockProxyService.getAll).toHaveBeenCalled()
        })
    })

    describe('POST /proxy', () => {
        it('should return HTTP_CREATED', async () => {
            const { id, ...proxyWithoutId } = proxy
            const proxyFvo: ProxyFVO = proxyWithoutId as ProxyFVO

            mockProxyService.create.mockResolvedValueOnce(proxy)

            await request(app)
                .post(ProxyRouter.PATH)
                .send(proxyFvo)
                .set('Content-Type', 'application/json')
                .expect('Content-Type', /json/)
                .expect(proxy)
                .expect(constants.HTTP_STATUS_CREATED)

            expect(mockProxyService.create).toHaveBeenCalledWith(proxyFvo)
        })
    })
})
