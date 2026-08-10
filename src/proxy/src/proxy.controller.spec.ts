import { Test, TestingModule } from '@nestjs/testing'
import { ProxyController } from './proxy.controller'
import { ProxyService } from './proxy.service'
import { ProxyProtocol } from './proxy.dto'

describe('ProxyController', () => {
    let controller: ProxyController
    let service: jest.Mocked<ProxyService>

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ProxyController],
            providers: [
                {
                    provide: ProxyService,
                    useValue: {
                        createProxy: jest.fn(),
                        listProxies: jest.fn(),
                        getHealthyProxy: jest.fn(),
                        getProxy: jest.fn(),
                        updateProxy: jest.fn(),
                        deleteProxy: jest.fn(),
                        reportProxyBlacklist: jest.fn(),
                    },
                },
            ],
        }).compile()

        controller = module.get(ProxyController)
        service = module.get(ProxyService)
    })

    it('delegates creation and listing to the service', async () => {
        const createDto = { protocol: ProxyProtocol.HTTP, host: 'proxy.example.com', port: 8080 }
        service.createProxy.mockResolvedValue({ id: 'proxy-id' } as any)
        service.listProxies.mockResolvedValue({ proxies: [], nextPageToken: '' })

        await expect(controller.createProxy(createDto)).resolves.toEqual({ id: 'proxy-id' })
        await expect(controller.listProxies({ pageSize: 10 })).resolves.toEqual({ proxies: [], nextPageToken: '' })
        expect(service.createProxy).toHaveBeenCalledWith(createDto)
        expect(service.listProxies).toHaveBeenCalledWith({ pageSize: 10 })
    })

    it('delegates proxy lookup, updates, deletion, and health operations to the service', async () => {
        service.getProxy.mockResolvedValue({ id: 'proxy-id' } as any)
        service.updateProxy.mockResolvedValue({ id: 'proxy-id' } as any)
        service.deleteProxy.mockResolvedValue({ id: 'proxy-id' } as any)
        service.getHealthyProxy.mockResolvedValue(undefined)
        service.reportProxyBlacklist.mockResolvedValue(undefined)

        await expect(controller.getProxy('proxy-id')).resolves.toEqual({ id: 'proxy-id' })
        await expect(controller.updateProxy('proxy-id', { enabled: false })).resolves.toEqual({ id: 'proxy-id' })
        await expect(controller.deleteProxy('proxy-id')).resolves.toEqual({ id: 'proxy-id' })
        await expect(controller.getHealthyProxy({ mxHost: 'mx.example.com' })).resolves.toBeUndefined()
        await expect(controller.reportProxyBlacklist('proxy-id', { mxHost: 'mx.example.com' })).resolves.toBeUndefined()
        expect(service.updateProxy).toHaveBeenCalledWith('proxy-id', { enabled: false })
        expect(service.reportProxyBlacklist).toHaveBeenCalledWith('proxy-id', { mxHost: 'mx.example.com' })
    })
})
