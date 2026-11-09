import { BadRequestException, NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { PermissionsGuard, REQUIRED_PERMISSIONS_METADATA_KEY } from '@tuposoft/lead-email-finder/modules/auth'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { instanceToPlain, plainToInstance } from 'class-transformer'
import { ProxyNotFoundError } from '../application/proxy-not-found.error'
import { ProxyService, ProxyValidationError } from '../application/proxy.service'
import { ProxyRecord } from '../domain/proxy-record'
import { ProxyLifecycle } from '../domain/proxy-lifecycle'
import { ProxyProtocol } from '../domain/proxy-protocol'
import { ProxyController } from './proxy.controller'
import { ProxyDto, ProxyListDto } from './proxy.dto'

function proxyRecord(overrides: Partial<ProxyRecord> = {}): ProxyRecord {
    return {
        id: 'proxy-id',
        protocol: ProxyProtocol.HTTP,
        host: 'proxy.example.com',
        port: 8080,
        state: ProxyLifecycle.ACTIVE,
        weight: 1,
        maxConcurrent: 1,
        requestsPerMinute: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    }
}

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
            .overrideGuard(PermissionsGuard)
            .useValue(null)
            .compile()

        controller = module.get(ProxyController)
        service = module.get(ProxyService)
    })

    it('requires platform:admin for every proxy endpoint', () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, ProxyController)).toEqual([PermissionsGuard])
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA_KEY, ProxyController)).toEqual(['platform:admin'])
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

    it('delegates creation and listing to the service, mapping records to DTOs', async () => {
        const createDto = { protocol: ProxyProtocol.HTTP, host: 'proxy.example.com', port: 8080 }
        const record = proxyRecord()
        service.createProxy.mockResolvedValue(record)
        service.listProxies.mockResolvedValue({ proxies: [record], nextPageToken: '' })

        await expect(controller.createProxy(createDto)).resolves.toEqual(expect.objectContaining({ id: 'proxy-id' }))
        await expect(controller.listProxies({ pageSize: 10 })).resolves.toEqual(
            expect.objectContaining({ proxies: [expect.objectContaining({ id: 'proxy-id' })], nextPageToken: '' }),
        )
        expect(service.createProxy).toHaveBeenCalledWith(createDto)
        expect(service.listProxies).toHaveBeenCalledWith({ pageSize: 10 })
    })

    it('delegates proxy lookup, updates, deletion, and health operations to the service', async () => {
        const record = proxyRecord()
        service.getProxy.mockResolvedValue(record)
        service.updateProxy.mockResolvedValue(record)
        service.deleteProxy.mockResolvedValue(record)
        service.getHealthyProxy.mockResolvedValue(undefined)
        service.reportProxyBlacklist.mockResolvedValue(undefined)

        await expect(controller.getProxy('proxy-id')).resolves.toEqual(expect.objectContaining({ id: 'proxy-id' }))
        await expect(controller.updateProxy('proxy-id', { state: ProxyLifecycle.DRAINING })).resolves.toEqual(
            expect.objectContaining({ id: 'proxy-id' }),
        )
        await expect(controller.deleteProxy('proxy-id')).resolves.toEqual(expect.objectContaining({ id: 'proxy-id' }))
        await expect(controller.getHealthyProxy({ mxHost: 'mx.example.com' })).resolves.toBeUndefined()
        await expect(controller.reportProxyBlacklist('proxy-id', { mxHost: 'mx.example.com' })).resolves.toBeUndefined()
        expect(service.updateProxy).toHaveBeenCalledWith('proxy-id', { state: ProxyLifecycle.DRAINING })
        expect(service.reportProxyBlacklist).toHaveBeenCalledWith('proxy-id', { mxHost: 'mx.example.com' })
    })

    it('translates ProxyNotFoundError into a 404', async () => {
        service.getProxy.mockRejectedValue(new ProxyNotFoundError('missing-id'))

        await expect(controller.getProxy('missing-id')).rejects.toThrow(NotFoundException)
    })

    it('translates ProxyValidationError into a 400', async () => {
        service.updateProxy.mockRejectedValue(new ProxyValidationError('updateMask must contain one or more writable proxy fields.'))

        await expect(controller.updateProxy('proxy-id', {})).rejects.toThrow(BadRequestException)
    })

    it('propagates an unrecognized error unchanged', async () => {
        const unexpected = new Error('database is down')
        service.getProxy.mockRejectedValue(unexpected)

        await expect(controller.getProxy('proxy-id')).rejects.toBe(unexpected)
    })
})
