import { Test, TestingModule } from '@nestjs/testing'
import { ProxyController } from './proxy.controller'
import { ProxyService } from './proxy.service'
import { HttpToGrpcExceptionFilter } from '@tuposoft/lead-email-finder/grpc'

jest.mock('@tuposoft/lead-email-finder/proto/proxy/v1/proxy', () => ({
    ProxyServiceControllerMethods: jest.fn(() => jest.fn()),
}))

describe('ProxyController', () => {
    let proxyController: ProxyController
    let proxyService: jest.Mocked<ProxyService>

    beforeEach(async () => {
        const app: TestingModule = await Test.createTestingModule({
            controllers: [ProxyController],
            providers: [
                {
                    provide: ProxyService,
                    useValue: {
                        getHello: jest.fn(),
                        getProxy: jest.fn(),
                        listProxies: jest.fn(),
                    },
                },
            ],
        })
            .overrideFilter(HttpToGrpcExceptionFilter)
            .useValue(null)
            .compile()

        proxyService = app.get(ProxyService)
        proxyController = app.get(ProxyController)
    })

    describe('root', () => {
        it('should return "Hello World!"', () => {
            proxyService.getHello.mockReturnValue('Hello World!')
            expect(proxyController.getHello()).toBe('Hello World!')
        })
    })

    it('delegates getProxy to the service', async () => {
        const response = { proxy: { id: 'proxy-id' } }
        proxyService.getProxy.mockResolvedValue(response as any)

        await expect(proxyController.getProxy({ id: 'proxy-id' })).resolves.toEqual(response)
        expect(proxyService.getProxy).toHaveBeenCalledWith({ id: 'proxy-id' })
    })

    it('delegates listProxies to the service', async () => {
        const request = { pageSize: 10 }
        const response = { proxies: [], nextPageToken: '' }
        proxyService.listProxies.mockResolvedValue(response)

        await expect(proxyController.listProxies(request)).resolves.toEqual(response)
        expect(proxyService.listProxies).toHaveBeenCalledWith(request)
    })
})
