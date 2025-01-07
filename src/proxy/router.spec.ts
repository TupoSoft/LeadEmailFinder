import { describe, expect, it, jest } from '@jest/globals'
import { ProxyRouter } from './router'
import { ProxyController } from './controller'
import express, { Router } from 'express'
import request from 'supertest'
import { constants } from 'node:http2'
import type { ProxyFvo } from './dto'
import type { Proxy } from './repository'
import { IProxyService } from './service'
import { IAuthMiddleware } from '../middleware'
import Mocked = jest.Mocked

jest.mock('../middleware/authenticate')
jest.mock('./mongo-repository')
jest.mock('./service')

describe('ProxyRouter', () => {
    const app = express()
    const expressRouter = Router()
    const proxyService: Mocked<IProxyService> = {
        create: jest.fn(),
        getAll: jest.fn(),
    }
    const authMiddleware: Mocked<IAuthMiddleware> = {
        authenticate: jest.fn((_req, _res, next) => {
            next()
        }),
    }

    const proxyController = new ProxyController(proxyService)
    const proxyRouter = new ProxyRouter(expressRouter, proxyController, authMiddleware)
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
            proxyService.getAll.mockResolvedValueOnce(allProxies)

            await request(app)
                .get(ProxyRouter.PATH)
                .expect('Content-Type', /json/)
                .expect(allProxies)
                .expect(constants.HTTP_STATUS_OK)

            expect(proxyService.getAll).toHaveBeenCalled()
        })
    })

    describe('POST /proxy', () => {
        const { id, ...proxyWithoutId } = proxy
        const proxyFvo: ProxyFvo = proxyWithoutId

        it('should return HTTP_CREATED', async () => {
            proxyService.create.mockResolvedValueOnce(proxy)

            await request(app)
                .post(ProxyRouter.PATH)
                .send(proxyFvo)
                .set('Content-Type', 'application/json')
                .expect('Content-Type', /json/)
                .expect(proxy)
                .expect(constants.HTTP_STATUS_CREATED)

            expect(proxyService.create).toHaveBeenCalledWith(proxyFvo)
        })

        it('should return HTTP_BAD_REQUEST when validation fails', async () => {
            await request(app)
                .post(ProxyRouter.PATH)
                .send({
                    type: 'socks5',
                    port: PROXY_PORT,
                })
                .set('Content-Type', 'application/json')
                .expect('Content-Type', /json/)
                .expect(constants.HTTP_STATUS_BAD_REQUEST)
        })
    })
})
