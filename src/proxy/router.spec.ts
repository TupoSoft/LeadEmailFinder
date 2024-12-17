import { describe, expect, it, jest } from '@jest/globals'
import { ProxyRouter } from './router'
import { ProxyController } from './controller'
import express, { Router } from 'express'
import request from 'supertest'
import { constants } from 'node:http2'
import type { ProxyFvo } from './dto'
import type { Proxy } from './repository'
import { ProxyService } from './service'
import { MongoProxyRepository } from './mongo-repository'
import { MongoClient } from 'mongodb'
import Mocked = jest.Mocked

jest.mock('../middleware/authenticate')
jest.mock('./mongo-repository')
jest.mock('./service')

describe('ProxyRouter', () => {
    const app = express()
    const expressRouter = Router()
    const mongoClient = new MongoClient('mongodb://localhost:27017')
    const db = mongoClient.db()
    const mongoProxyRepository = new MongoProxyRepository(db)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- testing
    const proxyService = new ProxyService(mongoProxyRepository) as Mocked<ProxyService>
    const proxyController = new ProxyController(proxyService)
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
