import { Test, TestingModule } from '@nestjs/testing'
import { ProxyController } from './proxy.controller'
import { ProxyService } from './proxy.service'
import { ProxyDto, ProxyListDto, ProxyProtocol } from './proxy.dto'
import { ApiKeyGuard } from '@tuposoft/lead-email-finder/modules/api-key'
import { KeyPermissions } from '@tuposoft/lead-email-finder/modules/api-key/domain/key.enum'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { instanceToPlain, plainToInstance } from 'class-transformer'

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
        })
            .overrideGuard(ApiKeyGuard)
            .useValue(null)
            .compile()

        controller = module.get(ProxyController)
        service = module.get(ProxyService)
    })

    it('requires an admin API key for every proxy endpoint', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, ProxyController)).toEqual([ApiKeyGuard])
        expect(Reflect.getMetadata('permissions', ProxyController)).toEqual([KeyPermissions.ADMIN])
    })

    it('does not serialize proxy credentials', () => {
        const response = plainToInstance(ProxyDto, {
            id: 'proxy-id',
            protocol: ProxyProtocol.HTTP,
            host: 'proxy.example.com',
            port: 8080,
            auth: { user: 'proxy-user', pass: 'proxy-password' },
        })

        expect(instanceToPlain(response, { strategy: 'excludeAll' })).not.toHaveProperty('auth')
    })

    it('serializes paginated proxies and omits their credentials', () => {
        const response = plainToInstance(ProxyListDto, {
            proxies: [
                {
                    id: 'proxy-id',
                    protocol: ProxyProtocol.HTTP,
                    host: 'proxy.example.com',
                    port: 8080,
                    auth: { user: 'proxy-user', pass: 'proxy-password' },
                },
            ],
            nextPageToken: '',
        })

        const serialized = instanceToPlain(response, { strategy: 'excludeAll' }) as {
            proxies: Array<Record<string, unknown>>
            nextPageToken: string
        }

        expect(serialized).toEqual({
            proxies: [
                expect.objectContaining({
                    id: 'proxy-id',
                    host: 'proxy.example.com',
                }),
            ],
            nextPageToken: '',
        })
        expect(serialized.proxies[0]).not.toHaveProperty('auth')
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
