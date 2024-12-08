import { describe, jest } from '@jest/globals'
import { ProxyRouter } from './router'
import { ProxyController } from './controller'
import { Router } from 'express'
import type { IProxyService } from './service'
import type { Proxy } from './repository'

export class MockProxyService implements IProxyService {
    getAll: () => Promise<Proxy[]> = jest.fn<typeof MockProxyService.prototype.getAll>()
    create: (proxy: Proxy) => Promise<Proxy> = jest.fn<typeof MockProxyService.prototype.create>()
}

describe('ProxyRouter', () => {
    const expressRouter = Router()
    const mockProxyService = new MockProxyService()
    const proxyController = new ProxyController(mockProxyService)
    const proxyRouter = new ProxyRouter(expressRouter, proxyController)
})
