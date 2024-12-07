import { describe } from '@jest/globals'
import { ProxyRouter } from './router'
import { ProxyController } from './controller'
import { Router } from 'express'
import { MockProxyService } from './service'

describe('ProxyRouter', () => {
    const expressRouter = Router()
    const mockProxyService = new MockProxyService()
    const proxyController = new ProxyController(mockProxyService)
    const proxyRouter = new ProxyRouter(expressRouter, proxyController)
})
