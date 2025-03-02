/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- testing */

import { describe, expect, it, jest } from '@jest/globals'
import { ProxyService } from './service'
import { MongoProxyRepository } from './mongo-repository'
import { MongoClient } from 'mongodb'
import type { Proxy } from './repository'
import Mocked = jest.Mocked

jest.mock('./mongo-repository')

describe('ProxyService', () => {
    const mongoClient = new MongoClient('mongodb://localhost:27017')
    const db = mongoClient.db()
    const proxyRepository = new MongoProxyRepository(db) as Mocked<MongoProxyRepository>
    const proxyService = new ProxyService(proxyRepository)

    const port = 3333
    const proxy: Proxy = {
        id: '1',
        type: 'socks5',
        host: 'example.com',
        port,
        user: 'foo',
        password: 'bar',
    }

    describe('getAll', () => {
        it('should return all proxies', async () => {
            const proxies = [proxy]
            proxyRepository.getAll.mockResolvedValueOnce(proxies)
            await expect(proxyService.getAll()).resolves.toEqual(proxies)
        })

        it('should create a new proxy', async () => {
            proxyRepository.create.mockResolvedValueOnce(proxy)
            await expect(proxyService.create(proxy)).resolves.toBe(proxy)
        })
    })
})
