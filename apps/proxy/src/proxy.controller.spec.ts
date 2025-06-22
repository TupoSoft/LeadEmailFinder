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
})
